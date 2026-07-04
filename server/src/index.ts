import { clearTimeout, setTimeout } from 'node:timers';
import { config } from 'dotenv';

config();

const { default: app, closeAppResources } = await import('./app.js');
const { summarizeErrorLog } = await import('./security.js');

const PORT = Number(process.env.PORT || 3000);
const server = app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));

// Fly sends SIGTERM with a 5s kill_timeout (fly.toml). Stop accepting new
// connections, let in-flight requests (including webhook processing) finish,
// then close Redis and exit before the hard kill.
const SHUTDOWN_GRACE_MS = 4000;
let shuttingDown = false;

function shutdown(reason: string, exitCode: number) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`🛑 [SHUTDOWN] ${reason} — closing server gracefully`);

  const forceExit = setTimeout(() => {
    console.error('🛑 [SHUTDOWN] Grace period elapsed, exiting now');
    process.exit(exitCode === 0 ? 1 : exitCode);
  }, SHUTDOWN_GRACE_MS);
  forceExit.unref();

  server.close(() => {
    void closeAppResources().finally(() => {
      clearTimeout(forceExit);
      process.exit(exitCode);
    });
  });
}

process.on('SIGTERM', () => shutdown('Received SIGTERM', 0));
process.on('SIGINT', () => shutdown('Received SIGINT', 0));

// Last-resort handlers: a rejected promise nobody awaited must not kill a
// serving process; log it and keep serving. An uncaught synchronous exception
// leaves state unknown, so log it and exit cleanly — Fly restarts the machine.
process.on('unhandledRejection', (reason) => {
  console.error('❌ [PROCESS] Unhandled promise rejection (continuing to serve):', summarizeErrorLog(reason));
});

process.on('uncaughtException', (error) => {
  console.error('❌ [PROCESS] Uncaught exception (fatal, shutting down):', summarizeErrorLog(error));
  shutdown('Uncaught exception', 1);
});
