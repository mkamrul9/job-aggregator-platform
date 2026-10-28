// service-scraper/ssrf.go
package main

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

var (
	ErrProhibitedScheme      = errors.New("prohibited protocol scheme: only http and https are permitted")
	ErrProhibitedCredentials = errors.New("prohibited credentials in target URL")
	ErrSingleLabelHost       = errors.New("prohibited single-label or intranet hostname")
	ErrUnapprovedHost        = errors.New("target host is not in the approved source host list")
	ErrPrivateIPBlocked      = errors.New("prohibited target IP: private, loopback, or metadata address blocked")
	ErrTooManyRedirects      = errors.New("maximum redirect limit exceeded")
)

// IP ranges for explicit blocking
var (
	cgnatRange = net.IPNet{
		IP:   net.ParseIP("100.64.0.0"),
		Mask: net.CIDRMask(10, 32),
	}
	ipv6LinkLocalRange = net.IPNet{
		IP:   net.ParseIP("fe80::"),
		Mask: net.CIDRMask(10, 128),
	}
	ipv6UlaRange = net.IPNet{
		IP:   net.ParseIP("fc00::"),
		Mask: net.CIDRMask(7, 128),
	}
)

// IsPrivateOrRestrictedIP returns true if the IP belongs to private, loopback, link-local,
// cloud metadata, carrier-grade NAT, or IPv6 ULA address space.
func IsPrivateOrRestrictedIP(ip net.IP) bool {
	if ip == nil {
		return true
	}

	// 1. Unspecified (0.0.0.0, ::)
	if ip.IsUnspecified() {
		return true
	}

	// 2. Loopback (127.0.0.0/8, ::1)
	if ip.IsLoopback() {
		return true
	}

	// 3. Link-local unicast / multicast (169.254.0.0/16, fe80::/10, etc.)
	if ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ipv6LinkLocalRange.Contains(ip) {
		return true
	}

	// 4. Standard private addresses (RFC 1918: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16; RFC 4193 ULA)
	if ip.IsPrivate() || ipv6UlaRange.Contains(ip) {
		return true
	}

	// 5. Carrier-Grade NAT (100.64.0.0/10)
	if cgnatRange.Contains(ip) {
		return true
	}

	// 6. Explicit cloud metadata check (169.254.169.254)
	if ip.Equal(net.ParseIP("169.254.169.254")) {
		return true
	}

	return false
}

// ValidateTargetURL parses and validates the target URL against protocol, credential,
// host approval, and DNS IP security constraints.
func ValidateTargetURL(rawURL string, approvedHosts []string) (*url.URL, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return nil, fmt.Errorf("invalid URL syntax: %w", err)
	}

	// Scheme check: only http and https
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return nil, ErrProhibitedScheme
	}

	// Credential check
	if parsed.User != nil {
		return nil, ErrProhibitedCredentials
	}

	host := parsed.Hostname()
	if host == "" {
		return nil, errors.New("missing hostname in target URL")
	}

	// Reject single-label hosts (e.g. localhost, intranet, corp)
	if !strings.Contains(host, ".") {
		return nil, ErrSingleLabelHost
	}

	// Approved hosts check (if list is non-empty)
	if len(approvedHosts) > 0 {
		matched := false
		lowerHost := strings.ToLower(host)
		for _, approved := range approvedHosts {
			if strings.EqualFold(lowerHost, approved) || strings.HasSuffix(lowerHost, "."+strings.ToLower(approved)) {
				matched = true
				break
			}
		}
		if !matched {
			return nil, fmt.Errorf("%w: host '%s'", ErrUnapprovedHost, host)
		}
	}

	// Resolve host and check each returned IP
	ips, err := net.LookupIP(host)
	if err != nil {
		return nil, fmt.Errorf("DNS resolution failed for host '%s': %w", host, err)
	}

	if len(ips) == 0 {
		return nil, fmt.Errorf("no IP addresses found for host '%s'", host)
	}

	for _, ip := range ips {
		if IsPrivateOrRestrictedIP(ip) {
			return nil, fmt.Errorf("%w: %s resolves to %s", ErrPrivateIPBlocked, host, ip.String())
		}
	}

	return parsed, nil
}

// NewSafeHTTPClient returns an HTTP client hardened against SSRF, DNS rebinding,
// and open redirects to prohibited destinations.
func NewSafeHTTPClient(timeout time.Duration, approvedHosts []string) *http.Client {
	if timeout <= 0 {
		timeout = 15 * time.Second
	}

	dialer := &net.Dialer{
		Timeout:   timeout,
		KeepAlive: 30 * time.Second,
	}

	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}

			// Validate IPs before dialing
			ips, err := net.DefaultResolver.LookupIP(ctx, "ip", host)
			if err != nil {
				return nil, err
			}

			for _, ip := range ips {
				if IsPrivateOrRestrictedIP(ip) {
					return nil, fmt.Errorf("%w: dialing %s (%s)", ErrPrivateIPBlocked, host, ip.String())
				}
			}

			return dialer.DialContext(ctx, network, net.JoinHostPort(host, port))
		},
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}

	return &http.Client{
		Transport: transport,
		Timeout:   timeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return ErrTooManyRedirects
			}
			// Revalidate redirect destination against SSRF policy
			_, err := ValidateTargetURL(req.URL.String(), approvedHosts)
			if err != nil {
				return fmt.Errorf("redirect blocked: %w", err)
			}
			return nil
		},
	}
}
