import { Controller, Get, Header } from '@nestjs/common';

@Controller('metrics')
export class MetricsController {
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  getMetrics(): string {
    const uptime = Math.floor(process.uptime());
    const memUsage = process.memoryUsage().rss;

    const lines = [
      '# HELP process_uptime_seconds Process uptime in seconds',
      '# TYPE process_uptime_seconds gauge',
      `process_uptime_seconds ${uptime}`,
      '# HELP process_resident_memory_bytes Process resident memory size in bytes',
      '# TYPE process_resident_memory_bytes gauge',
      `process_resident_memory_bytes ${memUsage}`,
      '# HELP seekers_user_service_status Service healthy indicator (1 = healthy)',
      '# TYPE seekers_user_service_status gauge',
      'seekers_user_service_status 1',
    ];

    return `${lines.join('\n')}\n`;
  }
}
