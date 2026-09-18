import type {
  OfflineWorkerCommand,
  OfflineWorkerExecutePayload,
  OfflineWorkerExecuteResult,
  OfflineWorkerInitializePayload,
  OfflineWorkerInitializeResult,
  OfflineWorkerRequest,
  OfflineWorkerResetPayload,
  OfflineWorkerResetResult,
  OfflineWorkerResponse,
} from '../models/offline.models'
import SqliteWorker from '../workers/sqlite.worker.ts?worker'

type WorkerPayloadMap = {
  initialize: OfflineWorkerInitializePayload
  execute: OfflineWorkerExecutePayload
  reset: OfflineWorkerResetPayload
  close: undefined
}

type WorkerResultMap = {
  initialize: OfflineWorkerInitializeResult
  execute: OfflineWorkerExecuteResult
  reset: OfflineWorkerResetResult
  close: undefined
}

export class OfflineDatabase {
  private readonly worker: Worker
  private requestId = 0
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason: Error) => void }>()

  constructor() {
    this.worker = new SqliteWorker()
    this.worker.addEventListener('message', this.onMessage)
    this.worker.addEventListener('error', this.onWorkerError)
  }

  request<T extends OfflineWorkerCommand>(command: T, payload: WorkerPayloadMap[T]): Promise<WorkerResultMap[T]> {
    const id = ++this.requestId
    const request: OfflineWorkerRequest = payload === undefined ? { id, command } : { id, command, payload }
    return new Promise<WorkerResultMap[T]>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      this.worker.postMessage(request)
    })
  }

  async close(): Promise<void> {
    try {
      await this.request('close', undefined)
    } finally {
      this.worker.terminate()
      this.worker.removeEventListener('message', this.onMessage)
      this.worker.removeEventListener('error', this.onWorkerError)
    }
  }

  private onMessage = (event: MessageEvent<OfflineWorkerResponse>) => {
    const response = event.data
    const pending = this.pending.get(response.id)
    if (!pending) return
    this.pending.delete(response.id)
    if (response.ok) pending.resolve(response.result)
    else pending.reject(new Error(response.error ?? 'Error desconocido en SQLite/WASM.'))
  }

  private onWorkerError = (event: ErrorEvent) => {
    const error = new Error(event.message || 'El Web Worker de SQLite no pudo iniciarse.')
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }
}
