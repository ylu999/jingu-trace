// sink/file-sink.ts
// FileEventSink — synchronous JSONL append for loop event persistence

import { EventSink, LoopEvent } from "@jingu/policy-core"
import { writeFileSync, mkdirSync } from "fs"
import { dirname } from "path"

export class FileEventSink implements EventSink {
  private logPath: string

  constructor(logPath: string) {
    this.logPath = logPath
    mkdirSync(dirname(logPath), { recursive: true })
  }

  emit(event: LoopEvent): void {
    writeFileSync(this.logPath, JSON.stringify(event) + "\n", { flag: "a", encoding: "utf8" })
  }

  flush(): Promise<void> {
    return Promise.resolve()
  }
}

export function createFileEventSink(runId: string, logsDir: string): FileEventSink {
  return new FileEventSink(`${logsDir}/loop-events-${runId}.jsonl`)
}
