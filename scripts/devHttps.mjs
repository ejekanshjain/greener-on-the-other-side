// `bun run dev:https`: the dev server over HTTPS, so phones on the same Wi-Fi get the
// secure-context features plain http lacks (Web Locks, wake lock, clipboard, sharing).
// It makes a self-signed certificate with openssl in .certs/ the first time, and again
// whenever this machine's LAN addresses change. Phones warn about the certificate once;
// accept it to continue. Stop `bun run dev` first: Next.js runs one dev server per folder.
// PORT changes the port (default 5176).
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const dir = join(root, '.certs')
const key = join(dir, 'key.pem')
const cert = join(dir, 'cert.pem')
const sanFile = join(dir, 'san.txt')
const port = process.env.PORT ?? '5176'

const lan = Object.values(networkInterfaces())
  .flat()
  .filter(net => net && net.family === 'IPv4' && !net.internal)
  .map(net => net.address)
const san = [
  'DNS:localhost',
  'IP:127.0.0.1',
  ...lan.map(ip => `IP:${ip}`)
].join(',')

const current =
  existsSync(key) && existsSync(cert) && existsSync(sanFile)
    ? readFileSync(sanFile, 'utf8') === san
    : false
if (!current) {
  mkdirSync(dir, { recursive: true })
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-sha256',
      '-days',
      '365',
      '-quiet',
      '-subj',
      '/CN=Greener dev',
      '-addext',
      `subjectAltName=${san}`,
      '-keyout',
      key,
      '-out',
      cert
    ],
    { stdio: 'ignore' }
  )
  writeFileSync(sanFile, san)
  console.log(`Made a self-signed certificate in .certs for ${san}`)
}

for (const ip of lan) console.log(`Phones on this Wi-Fi: https://${ip}:${port}`)
const next = spawn(
  join(root, 'node_modules', '.bin', 'next'),
  [
    'dev',
    '-p',
    port,
    '--experimental-https',
    '--experimental-https-key',
    key,
    '--experimental-https-cert',
    cert
  ],
  { cwd: root, stdio: 'inherit' }
)
next.on('exit', code => process.exit(code ?? 0))
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => next.kill(signal))
