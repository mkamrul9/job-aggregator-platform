import urllib.request
import json

es_url = "http://localhost:9200/jobs_index/_doc"

dummy_jobs = [
    {
        "title": "Senior React Engineer",
        "company": "TechNova Solutions",
        "url": "https://example.com/job/1",
        "raw_description": "We are looking for a Senior React Engineer with 5+ years of experience in building scalable frontend applications. Must be proficient with Next.js, TypeScript, and modern CSS frameworks. You will lead the migration of our legacy dashboard to a cutting-edge React ecosystem.",
        "location": "Remote",
        "salary": "$130,000 - $160,000"
    },
    {
        "title": "Backend Go Developer",
        "company": "Streamline Data",
        "url": "https://example.com/job/2",
        "raw_description": "Streamline Data is seeking a Backend Developer skilled in Go (Golang) to optimize our high-throughput data processing pipelines. Experience with Kafka, PostgreSQL, and Docker is highly preferred. You will be responsible for scaling our ingestion microservices.",
        "location": "New York, NY",
        "salary": "$140,000 - $170,000"
    },
    {
        "title": "Full Stack Engineer (Node.js & React)",
        "company": "Quantum FinTech",
        "url": "https://example.com/job/3",
        "raw_description": "Join our fast-paced FinTech startup! We need a Full Stack Engineer who can seamlessly transition between Node.js (NestJS) on the backend and React on the frontend. Knowledge of financial systems and robust security practices is a big plus.",
        "location": "San Francisco, CA",
        "salary": "$150,000 - $180,000"
    },
    {
        "title": "Data Scientist - AI & ML",
        "company": "Predictive Minds",
        "url": "https://example.com/job/4",
        "raw_description": "We are searching for a Data Scientist to build predictive models using Python, TensorFlow, and scikit-learn. You will work closely with our data engineering team to deploy machine learning models that analyze consumer behavior in real-time.",
        "location": "Remote",
        "salary": "$120,000 - $150,000"
    },
    {
        "title": "DevOps Engineer (Kubernetes & AWS)",
        "company": "CloudScape",
        "url": "https://example.com/job/5",
        "raw_description": "CloudScape is looking for a DevOps Engineer to manage our cloud infrastructure. Expertise in AWS, Kubernetes, Terraform, and CI/CD pipelines (GitHub Actions) is required. Help us achieve 99.99% uptime across our global microservice architecture.",
        "location": "Austin, TX",
        "salary": "$135,000 - $165,000"
    },
    {
        "title": "Python Backend Developer",
        "company": "AI Innovations",
        "url": "https://example.com/job/6",
        "raw_description": "We need a strong Python backend developer to build robust APIs using FastAPI. The ideal candidate has experience with gRPC, asynchronous programming, and integrating machine learning models into production systems.",
        "location": "Remote",
        "salary": "$125,000 - $145,000"
    },
    {
        "title": "Frontend Developer - Vue.js",
        "company": "Creative Agency XYZ",
        "url": "https://example.com/job/7",
        "raw_description": "Looking for a creative frontend developer to build stunning user interfaces using Vue.js and Nuxt. You should have a keen eye for design, animations, and pixel-perfect implementation of Figma mockups.",
        "location": "London, UK",
        "salary": "£70,000 - £90,000"
    },
    {
        "title": "Machine Learning Engineer",
        "company": "Deep Insights",
        "url": "https://example.com/job/8",
        "raw_description": "Join our AI research team to develop state-of-the-art NLP models. Strong background in Python, PyTorch, and NLP libraries (like spaCy or HuggingFace) is essential. A Master's or Ph.D. in Computer Science is preferred.",
        "location": "Boston, MA",
        "salary": "$160,000 - $190,000"
    },
    {
        "title": "Site Reliability Engineer",
        "company": "Global Scale Inc.",
        "url": "https://example.com/job/9",
        "raw_description": "As an SRE, you will bridge the gap between development and operations. Focus on observability (Prometheus, Grafana), incident response, and performance tuning of our large-scale distributed systems.",
        "location": "Seattle, WA",
        "salary": "$145,000 - $175,000"
    },
    {
        "title": "Junior Frontend Developer",
        "company": "Startup Launchpad",
        "url": "https://example.com/job/10",
        "raw_description": "Great opportunity for a junior developer to learn and grow! You will work alongside senior engineers to build responsive web applications using HTML, CSS, and JavaScript (React experience is a bonus).",
        "location": "Remote",
        "salary": "$70,000 - $90,000"
    }
]

for i, job in enumerate(dummy_jobs):
    req = urllib.request.Request(es_url, data=json.dumps(job).encode('utf-8'), headers={'Content-Type': 'application/json'}, method='POST')
    try:
        response = urllib.request.urlopen(req)
        print(f"Added job {i+1}: {job['title']}")
    except Exception as e:
        print(f"Failed to add job {i+1}: {e}")
