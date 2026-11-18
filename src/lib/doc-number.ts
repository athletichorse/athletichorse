/** Stock document number as people see it: one counter, a prefix by type (TR-00076, RC-00024 …). */
const PREFIX: Record<string, string> = { transfer: "TR", receipt: "RC", write_off: "IS", count: "CT", adjust: "AD", opening: "OP" };
export function docNumber(kind: string, no: number | string | null | undefined): string {
  if (no === null || no === undefined || no === "") return "—";
  return `${PREFIX[kind] ?? "DOC"}-${String(no).padStart(5, "0")}`;
}
