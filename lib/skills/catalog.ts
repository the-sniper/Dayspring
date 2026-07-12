// Curated catalog of industry-standard skills for the profile Skills editor's
// autocomplete. Bundled locally (no API/network dependency) so suggestions are
// instant and offline. Grouped here for maintainability; exported flat + deduped.
// Users can always add a custom skill that isn't in this list.

const CATALOG_GROUPS: Record<string, string[]> = {
  languages: [
    "JavaScript", "TypeScript", "Python", "Java", "C", "C++", "C#", "Go",
    "Rust", "Ruby", "PHP", "Swift", "Kotlin", "Objective-C", "Scala", "Dart",
    "R", "MATLAB", "Perl", "Haskell", "Elixir", "Erlang", "Clojure", "Lua",
    "Groovy", "Julia", "Solidity", "Bash", "Shell", "PowerShell", "SQL",
    "HTML", "CSS", "Sass", "SCSS", "Less", "GraphQL", "Assembly", "F#",
    "Visual Basic", "COBOL", "Fortran", "Zig", "Nim", "Crystal",
  ],
  frontend: [
    "React", "Next.js", "Vue.js", "Nuxt.js", "Angular", "Svelte", "SvelteKit",
    "Solid.js", "Preact", "Redux", "Redux Toolkit", "Zustand", "Recoil",
    "MobX", "React Query", "TanStack Query", "React Router", "Context API",
    "Remix", "Astro", "Gatsby", "jQuery", "Backbone.js", "Ember.js",
    "Webpack", "Vite", "Rollup", "Parcel", "esbuild", "Babel", "Turbopack",
    "Tailwind CSS", "Bootstrap", "Material-UI", "Chakra UI", "Ant Design",
    "Styled Components", "Emotion", "Framer Motion", "GSAP", "Three.js",
    "D3.js", "Storybook", "PWA", "WebSockets", "WebRTC", "WebGL", "WebAssembly",
    "Responsive Design", "Accessibility (WCAG)", "SEO", "Progressive Web Apps",
  ],
  backend: [
    "Node.js", "Express", "NestJS", "Fastify", "Koa", "Deno", "Bun",
    "Django", "Flask", "FastAPI", "Tornado", "Spring", "Spring Boot",
    "Ruby on Rails", "Laravel", "Symfony", "ASP.NET", ".NET Core", "Gin",
    "Fiber", "Echo", "Actix", "Phoenix", "Micronaut", "Quarkus", "REST APIs",
    "GraphQL APIs", "gRPC", "Microservices", "Serverless", "Message Queues",
    "RabbitMQ", "Apache Kafka", "Celery", "Socket.io", "OAuth", "JWT",
    "OpenAPI", "Swagger", "WebHooks", "Server-Side Rendering",
  ],
  cloud_devops: [
    "AWS", "Amazon EC2", "AWS Lambda", "Amazon S3", "Amazon RDS",
    "AWS CloudFormation", "Google Cloud Platform", "Microsoft Azure",
    "DigitalOcean", "Heroku", "Vercel", "Netlify", "Cloudflare", "Docker",
    "Kubernetes", "Helm", "Terraform", "Ansible", "Pulumi", "Jenkins",
    "GitHub Actions", "GitLab CI", "CircleCI", "Travis CI", "ArgoCD",
    "CI/CD", "Prometheus", "Grafana", "Datadog", "New Relic", "Sentry",
    "ELK Stack", "Nginx", "Apache", "Linux", "Bash Scripting", "Git",
    "GitHub", "GitLab", "Bitbucket", "Infrastructure as Code", "Observability",
    "Load Balancing", "CDN", "Site Reliability Engineering",
  ],
  databases: [
    "PostgreSQL", "MySQL", "SQLite", "MongoDB", "Redis", "Cassandra",
    "DynamoDB", "Firebase", "Firestore", "Supabase", "MariaDB",
    "Microsoft SQL Server", "Oracle Database", "Elasticsearch", "Neo4j",
    "CouchDB", "InfluxDB", "Snowflake", "BigQuery", "Redshift", "Databricks",
    "Prisma", "Drizzle ORM", "Sequelize", "TypeORM", "SQLAlchemy",
    "Hibernate", "Database Design", "Data Modeling", "Query Optimization",
    "Algolia", "Meilisearch",
  ],
  data_ml: [
    "Machine Learning", "Deep Learning", "TensorFlow", "PyTorch", "Keras",
    "scikit-learn", "Pandas", "NumPy", "SciPy", "Matplotlib", "Seaborn",
    "Jupyter", "Apache Spark", "Hadoop", "Airflow", "dbt", "Tableau",
    "Power BI", "Looker", "Data Analysis", "Data Visualization",
    "Data Engineering", "ETL", "Natural Language Processing", "Computer Vision",
    "LLMs", "Prompt Engineering", "Hugging Face", "OpenAI API", "LangChain",
    "MLOps", "Statistics", "A/B Testing", "Predictive Modeling", "XGBoost",
    "Reinforcement Learning", "Recommendation Systems",
  ],
  mobile: [
    "React Native", "Flutter", "SwiftUI", "UIKit", "Jetpack Compose",
    "Android SDK", "iOS Development", "Android Development", "Xamarin",
    "Ionic", "Expo", "Kotlin Multiplatform", "Mobile UI/UX",
  ],
  design: [
    "Figma", "Adobe XD", "Sketch", "Adobe Photoshop", "Adobe Illustrator",
    "InVision", "Framer", "UI Design", "UX Design", "UI/UX", "Wireframing",
    "Prototyping", "Design Systems", "User Research", "Interaction Design",
    "Visual Design", "Typography", "Motion Design",
  ],
  testing: [
    "Jest", "Vitest", "Mocha", "Chai", "Cypress", "Playwright", "Selenium",
    "Testing Library", "PyTest", "JUnit", "TestNG", "Enzyme", "Puppeteer",
    "Unit Testing", "Integration Testing", "End-to-End Testing",
    "Test-Driven Development", "Load Testing", "Postman",
  ],
  practices: [
    "Agile", "Scrum", "Kanban", "DevOps", "System Design",
    "Object-Oriented Programming", "Functional Programming",
    "Data Structures", "Algorithms", "Design Patterns", "Clean Code",
    "Code Review", "Pair Programming", "Performance Optimization",
    "Security Best Practices", "Distributed Systems", "Event-Driven Architecture",
    "Domain-Driven Design", "Refactoring", "Technical Documentation",
  ],
  soft: [
    "Leadership", "Communication", "Team Management", "Project Management",
    "Problem Solving", "Critical Thinking", "Mentoring", "Public Speaking",
    "Stakeholder Management", "Cross-functional Collaboration",
    "Time Management", "Product Management", "Roadmapping",
  ],
};

// Flat, deduped, sorted catalog.
export const SKILL_CATALOG: string[] = Array.from(
  new Set(Object.values(CATALOG_GROUPS).flat()),
).sort((a, b) => a.localeCompare(b));

// Lowercased lookup for fast, case-insensitive matching.
const CATALOG_LOWER = SKILL_CATALOG.map((s) => s.toLowerCase());

// Suggest skills for an autocomplete query. Prefix matches rank above
// substring matches; anything already selected is excluded.
export function suggestSkills(
  query: string,
  exclude: string[] = [],
  limit = 8,
): string[] {
  const q = query.trim().toLowerCase();
  const taken = new Set(exclude.map((s) => s.trim().toLowerCase()));
  if (!q) {
    return SKILL_CATALOG.filter((s) => !taken.has(s.toLowerCase())).slice(0, limit);
  }
  const prefix: string[] = [];
  const substr: string[] = [];
  for (let i = 0; i < SKILL_CATALOG.length; i++) {
    const lower = CATALOG_LOWER[i];
    if (taken.has(lower)) continue;
    if (lower.startsWith(q)) prefix.push(SKILL_CATALOG[i]);
    else if (lower.includes(q)) substr.push(SKILL_CATALOG[i]);
  }
  return [...prefix, ...substr].slice(0, limit);
}

// Does the catalog already contain this skill (case-insensitive)?
export function isKnownSkill(skill: string): boolean {
  return CATALOG_LOWER.includes(skill.trim().toLowerCase());
}
