import fs from "fs";
import net from "net";
import { createTunnel } from "tunnel-ssh";
import { SshConfig } from "../types/index.js";

interface TunnelEntry {
  server: net.Server;
  localPort: number;
  refCount: number;
}

/** Singleton map: tunnelKey → active tunnel server */
const activeTunnels = new Map<string, TunnelEntry>();

function tunnelKey(
  ssh: SshConfig,
  remoteHost: string,
  remotePort: number,
): string {
  return `${ssh.host}:${ssh.port}→${remoteHost}:${remotePort}`;
}

function resolvePrivateKey(config: SshConfig): Buffer {
  if (config.privateKeyIsPath) {
    const resolved = config.privateKey.startsWith("~")
      ? config.privateKey.replace("~", process.env.HOME ?? "")
      : config.privateKey;
    return fs.readFileSync(resolved);
  }
  return Buffer.from(config.privateKey);
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address() as net.AddressInfo;
      srv.close(() => resolve(addr.port));
    });
    srv.on("error", reject);
  });
}

/**
 * Opens (or reuses) an SSH tunnel to remoteHost:remotePort.
 * Returns the local port you should connect to instead.
 */
export async function openTunnel(
  config: SshConfig,
  remoteHost: string,
  remotePort: number,
): Promise<number> {
  const key = tunnelKey(config, remoteHost, remotePort);

  const existing = activeTunnels.get(key);
  if (existing) {
    existing.refCount++;
    return existing.localPort;
  }

  const localPort = await findFreePort();
  const privateKey = resolvePrivateKey(config);

  const sshOptions = {
    host: config.host,
    port: config.port,
    username: config.username,
    privateKey,
    passphrase: config.passphrase,
  };

  const forwardOptions = {
    srcAddr: "127.0.0.1",
    srcPort: localPort,
    dstAddr: remoteHost,
    dstPort: remotePort,
  };

  const [server] = await createTunnel(
    { autoClose: false, reconnectOnError: false },
    { port: localPort, host: "127.0.0.1" },
    sshOptions,
    forwardOptions,
  );

  activeTunnels.set(key, { server, localPort, refCount: 1 });
  console.error(`[tunnel] Opened ${key} → 127.0.0.1:${localPort}`);

  return localPort;
}

/**
 * Decrements refcount and closes the tunnel when it reaches 0.
 */
export async function closeTunnel(
  ssh: SshConfig,
  remoteHost: string,
  remotePort: number,
): Promise<void> {
  const key = tunnelKey(ssh, remoteHost, remotePort);
  const entry = activeTunnels.get(key);
  if (!entry) return;

  entry.refCount--;
  if (entry.refCount <= 0) {
    await new Promise<void>((resolve) => entry.server.close(() => resolve()));
    activeTunnels.delete(key);
    console.error(`[tunnel] Closed ${key}`);
  }
}

export async function closeAllTunnels(): Promise<void> {
  const entries = [...activeTunnels.entries()];
  await Promise.all(
    entries.map(
      ([, entry]) =>
        new Promise<void>((resolve) => entry.server.close(() => resolve())),
    ),
  );
  activeTunnels.clear();
  console.error("[tunnel] All tunnels closed");
}
