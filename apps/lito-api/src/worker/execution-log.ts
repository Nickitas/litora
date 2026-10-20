import { StringDecoder } from "node:string_decoder";

/** Собирает UTF-8 двух потоков, не разрывая символы при чтении и ограничении размера. */
export class ExecutionLog {
  private readonly decoders = { stdout: new StringDecoder("utf8"), stderr: new StringDecoder("utf8") };
  private value = "";
  private truncated = false;

  constructor(private readonly maxLength = 1_000_000) {}

  get text(): string { return this.value; }

  append(stream: "stdout" | "stderr", chunk: Buffer): void {
    if (!this.truncated) this.add(this.decoders[stream].write(chunk));
  }

  finish(): string {
    this.add(this.decoders.stdout.end());
    this.add(this.decoders.stderr.end());
    return this.value;
  }

  private add(text: string): void {
    if (this.truncated) return;
    const remaining = this.maxLength - this.value.length;
    if (text.length <= remaining) {
      this.value += text;
      return;
    }
    let prefix = text.slice(0, remaining);
    const last = prefix.charCodeAt(prefix.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) prefix = prefix.slice(0, -1);
    this.value += prefix;
    this.truncated = true;
  }
}
