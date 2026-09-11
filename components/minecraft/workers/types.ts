/**
 * workers/ — @reserved Phase 2+
 *
 * 未來功能（例如將 Chunk Meshing、World Generation 移至 Web Worker）
 * 僅允許預留 Interface，Phase 1 禁止任何實作。
 */

/**
 * @reserved Phase 2+
 * Web Worker 任務描述。實際協定於未來階段定義，Phase 1 不使用。
 */
export interface IReservedWorkerTask {
  /** 任務識別碼（協定未定義，保留欄位）。 */
  readonly taskId: string;
}
