// THE CONNECT TIMEOUT AFTER A STALL (fork, 2026-11-22, a report from the owner's own install). A
// stall in this process that ends in an I/O or `setImmediate` callback runs timers before the next
// poll, so a connect the OS finished long ago was reported as timed out. These use a real loopback
// listener: the ordering is libuv's, and a fake would only restate the assumption.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:net'
import { connectToEngine, failIfStillConnecting } from '../src/main/dataServer/socketChannel'

async function listening(): Promise<{ server: Server; port: number }> {
  const server = createServer((socket) => {
    socket.on('error', () => undefined)
  })
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('no port')
  return { server, port: address.port }
}

function blockFor(ms: number): void {
  const end = Date.now() + ms
  while (Date.now() < end) {
    // The stall: nothing else in this process runs.
  }
}

test('a connect that completed during a stall longer than its timeout still connects', async () => {
  const { server, port } = await listening()
  try {
    // From a `setImmediate` callback, the phase after which timers run before the next poll. The
    // connect itself is issued on a nextTick, so the stall is queued behind it.
    const channel = await new Promise<Awaited<ReturnType<typeof connectToEngine>>>((resolve, reject) => {
      setImmediate(() => {
        connectToEngine(port, 50).then(resolve, reject)
        process.nextTick(() => {
          blockFor(200)
        })
      })
    })
    channel.close()
  } finally {
    server.close()
  }
})

test('a refused connect still rejects with its own error', async () => {
  const { server, port } = await listening()
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve()
    })
  })
  await assert.rejects(connectToEngine(port, 2_000), (err: NodeJS.ErrnoException) => {
    assert.equal(err.code, 'ECONNREFUSED')
    return true
  })
})

test('a socket still connecting after pending I/O has had its turn has really timed out', async () => {
  let failed = 0
  failIfStillConnecting({ connecting: true }, () => {
    failed += 1
  })
  assert.equal(failed, 0, 'not in the timer callback itself')
  await new Promise<void>((resolve) => {
    setImmediate(resolve)
  })
  assert.equal(failed, 1)
})

test('a socket that connected in the meantime is left alone', async () => {
  const socket = { connecting: true }
  let failed = 0
  failIfStillConnecting(socket, () => {
    failed += 1
  })
  socket.connecting = false
  await new Promise<void>((resolve) => {
    setImmediate(resolve)
  })
  assert.equal(failed, 0)
})
