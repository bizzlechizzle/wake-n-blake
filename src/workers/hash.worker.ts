/**
 * Hash worker thread
 * Runs hashing operations in parallel worker threads
 */

import { parentPort } from 'node:worker_threads';
import * as fs from 'node:fs';
import { createHash as blake3Hash } from 'blake3';
import { createHash as cryptoHash } from 'node:crypto';

interface HashTask {
  id: number;
  filePath: string;
  algorithm: 'blake3' | 'blake3-full' | 'sha256' | 'sha512';
  bufferSize: number;
}

interface HashResult {
  id: number;
  filePath: string;
  hash: string;
  size: number;
  error?: string;
}

interface Hasher {
  update(data: Buffer): void;
  digest(encoding: 'hex'): string;
}

// Worker receives tasks from parent
if (parentPort) {
  parentPort.on('message', async (task: HashTask) => {
    try {
      const result = await hashFile(task);
      parentPort!.postMessage(result);
    } catch (err: unknown) {
      parentPort!.postMessage({
        id: task.id,
        filePath: task.filePath,
        hash: '',
        size: 0,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });
}

async function hashFile(task: HashTask): Promise<HashResult> {
  const { id, filePath, algorithm, bufferSize } = task;

  // Create appropriate hasher
  let hasher: Hasher;
  if (algorithm === 'blake3' || algorithm === 'blake3-full') {
    hasher = blake3Hash() as unknown as Hasher;
  } else if (algorithm === 'sha256') {
    hasher = cryptoHash('sha256') as unknown as Hasher;
  } else {
    hasher = cryptoHash('sha512') as unknown as Hasher;
  }

  // Read and hash file
  const stream = fs.createReadStream(filePath, { highWaterMark: bufferSize });
  let size = 0;

  for await (const chunk of stream) {
    hasher.update(chunk);
    size += chunk.length;
  }

  // Get hash result
  let hash = hasher.digest('hex');
  if (algorithm === 'blake3') {
    hash = hash.slice(0, 16);
  }

  return { id, filePath, hash, size };
}
