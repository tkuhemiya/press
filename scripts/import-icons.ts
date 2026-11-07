import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const usage = `Usage: node scripts/import-icons.ts <aws-dir> <azure-dir> <gcp-dir> <k8s-dir>

  aws-dir    the unzipped AWS Architecture Icons package
  azure-dir  the unzipped Azure Public Service Icons package
  gcp-dir    a folder holding the unzipped Google Cloud core-products and category icon packages
  k8s-dir    a checkout of github.com/kubernetes/community`;

const [awsDir, azureDir, gcpDir, k8sDir] = process.argv.slice(2);
if (!awsDir || !azureDir || !gcpDir || !k8sDir) {
  console.error(usage);
  process.exit(1);
}

const out = new URL('../assets/icons/', import.meta.url);

const walk = (dir: string): string[] =>
  readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = join(dir, name);
      if (name === '__MACOSX') return [];
      return statSync(path).isDirectory() ? walk(path) : [path];
    });

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const minify = (svg: string): string =>
  svg
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<title>[\s\S]*?<\/title>/g, '')
    .replace(/<desc>[\s\S]*?<\/desc>/g, '')
    .replace(/<metadata[\s\S]*?<\/metadata>/g, '')
    .replace(/<sodipodi:namedview[\s\S]*?(\/>|<\/sodipodi:namedview>)/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim();

function write(vendor: string, icons: Map<string, string>): void {
  const dir = new URL(`${vendor}/`, out);
  mkdirSync(dir, { recursive: true });
  for (const name of readdirSync(dir)) if (name.endsWith('.svg')) rmSync(new URL(name, dir));
  for (const [name, path] of icons) writeFileSync(new URL(`${name}.svg`, dir), minify(readFileSync(path, 'utf8')));
  console.log(`${vendor}: ${icons.size} icons`);
}

function collect(paths: string[], name: (path: string) => string | undefined): Map<string, string> {
  const icons = new Map<string, string>();
  for (const path of paths) {
    const n = name(path);
    if (n && !icons.has(n)) icons.set(n, path);
  }
  return icons;
}

const AWS_NAMES: Record<string, string> = {
  'simple-storage-service': 's3',
  'simple-storage-service-glacier': 's3-glacier',
  's3-on-outposts': 's3-on-outposts',
  'simple-queue-service': 'sqs',
  'simple-notification-service': 'sns',
  'simple-email-service': 'ses',
  'elastic-container-service': 'ecs',
  'elastic-kubernetes-service': 'eks',
  'elastic-container-registry': 'ecr',
  'elastic-block-store': 'ebs',
  'elastic-load-balancing': 'elb',
  'identity-and-access-management': 'iam',
  'key-management-service': 'kms',
  'virtual-private-cloud': 'vpc',
  'managed-streaming-for-apache-kafka': 'msk',
  'marketplace-light': 'marketplace',
};

write(
  'aws',
  collect(
    walk(awsDir).filter((p) => /Architecture-Service-Icons/.test(p) && /\/48\/[^/]+\.svg$/.test(p)),
    (path) => {
      const name = slug(
        basename(path, '.svg')
          .replace(/^Arch_/, '')
          .replace(/_48$/, '')
          .replace(/^(AWS|Amazon)-/, ''),
      );
      if (name === 'marketplace-dark') return undefined;
      return AWS_NAMES[name] ?? name;
    },
  ),
);

write(
  'azure',
  collect(
    walk(azureDir).filter((p) => p.endsWith('.svg')),
    (path) => {
      const name = slug(basename(path, '.svg').replace(/^.*icon-service-/, ''));
      return name.startsWith('azure-') && name.length > 8 ? name.slice(6) : name;
    },
  ),
);

write(
  'gcp',
  collect(
    walk(gcpDir).filter((p) => /\/SVG\/[^/]+\.svg$/.test(p)),
    (path) => slug(basename(join(path, '..', '..'))),
  ),
);

const K8S_NAMES: Record<string, string> = {
  'c-role': 'cluster-role',
  cm: 'configmap',
  crb: 'cluster-role-binding',
  crd: 'custom-resource-definition',
  cronjob: 'cronjob',
  deploy: 'deployment',
  ds: 'daemonset',
  ep: 'endpoints',
  group: 'group',
  hpa: 'horizontal-pod-autoscaler',
  ing: 'ingress',
  job: 'job',
  limits: 'limit-range',
  netpol: 'network-policy',
  ns: 'namespace',
  pod: 'pod',
  psp: 'pod-security-policy',
  pv: 'persistent-volume',
  pvc: 'persistent-volume-claim',
  quota: 'resource-quota',
  rb: 'role-binding',
  role: 'role',
  rs: 'replicaset',
  sa: 'service-account',
  sc: 'storage-class',
  secret: 'secret',
  sts: 'statefulset',
  svc: 'service',
  user: 'user',
  vol: 'volume',
  'control-plane': 'control-plane',
  etcd: 'etcd',
  node: 'node',
};

write(
  'k8s',
  collect(
    walk(join(k8sDir, 'icons', 'svg')).filter((p) => p.includes('/unlabeled/')),
    (path) => K8S_NAMES[basename(path, '.svg')],
  ),
);
