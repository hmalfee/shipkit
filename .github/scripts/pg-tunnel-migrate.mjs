// oxlint-disable no-console
// oxlint-disable eslint-js/no-restricted-syntax
import { spawn } from 'child_process';
import { createServer } from 'net';

function createTunnel(remoteHost, remotePort, localPort) {
    return new Promise((resolve) => {
        const server = createServer((socket) => {
            const relay = `
                CIDS=$(docker ps -q --filter "name=dokploy.1.");
                if [ $(echo "$CIDS" | wc -w) -ne 1 ]; then
                    echo "Expected 1 dokploy container, got: $CIDS" >&2
                    exit 1
                fi
                docker exec -i $CIDS node -e "
                    const s = require('net').connect(${remotePort}, '${remoteHost}');
                    process.stdin.pipe(s).pipe(process.stdout);
                    s.on('error', () => process.exit(1));
                "
            `;
            const ssh = spawn('ssh', [
                '-S',
                '/tmp/dokploy_ssh.sock',
                'placeholder',
                relay,
            ]);
            socket.pipe(ssh.stdin);
            ssh.stdout.pipe(socket);
            ssh.on('error', (err) =>
                console.error('SSH bridge error:', err.message),
            );
            socket.on('error', (err) =>
                console.error('Socket error:', err.message),
            );
            socket.on('close', () => ssh.kill());
        });
        server.listen(localPort, '127.0.0.1', () => resolve(server));
    });
}

function runCommand(command, args, env) {
    const name = `${command} ${args.join(' ')}`;
    return new Promise((resolve, reject) => {
        console.log(`\n--- Running ${name} ---`);
        const child = spawn(command, args, { stdio: 'inherit', env });
        child.on('close', (code) => {
            if (code !== 0)
                reject(new Error(`${name} failed with code ${code}`));
            else resolve();
        });
    });
}

async function attemptMigrate(env) {
    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            await runCommand(
                'pnpm',
                ['--filter', '@shipkit/db', 'run', 'db:migrate'],
                env,
            );
            return;
        } catch {
            if (attempt === 5)
                throw new Error('Migration failed after 5 attempts');
            console.log(
                `Migration attempt ${attempt} failed, retrying in 3 seconds...`,
            );
            await new Promise((r) => setTimeout(r, 3000));
        }
    }
}

const pgLocalPort = 15432;
const pgServer = await createTunnel(
    process.env.POSTGRES_APP_NAME,
    5432,
    pgLocalPort,
);

let redisServer = null;
const env = { ...process.env };
env.POSTGRES_URL = `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@127.0.0.1:${pgLocalPort}/${process.env.POSTGRES_DB}`;

if (process.env.REDIS_URL) {
    const redisLocalPort = 16379;
    const rUrl = new URL(process.env.REDIS_URL);
    redisServer = await createTunnel(
        rUrl.hostname,
        rUrl.port || 6379,
        redisLocalPort,
    );
    rUrl.hostname = '127.0.0.1';
    rUrl.port = redisLocalPort;
    env.REDIS_URL = rUrl.toString();
}

await new Promise((r) => setTimeout(r, 1000));

try {
    await attemptMigrate(env);
    console.log('Migrations complete.');

    if (process.env.GITHUB_REF_NAME === 'staging') {
        // TODO: When the app has real users, seeding the staging database isn't ideal.
        // A better approach would be to clone the production database to staging,
        // ensuring staging data accurately reflects production scenarios.
        console.log('Staging environment detected. Running db:seed...');
        await runCommand(
            'pnpm',
            ['--filter', '@shipkit/db', 'run', 'db:seed'],
            env,
        );
        console.log('Seeding complete.');
    }
} catch (err) {
    console.error(err.message);
    process.exitCode = 1;
} finally {
    pgServer.close();
    if (redisServer) redisServer.close();
}
