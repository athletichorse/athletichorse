import type { Dict } from "@/i18n";
import { CAMPAIGN_STATUSES, CHANNELS } from "@/lib/marketing";

type C = { id?: string; name?: string; channel?: string; status?: string; start_on?: string; end_on?: string | null; budget?: number | string; spend_manual?: number | string; discount_code?: string | null; goal?: string; notes?: string; meta_campaign_id?: string | null };

/** The campaign's fields (new and edit). Meta campaigns keep their channel. */
export function CampaignFields({ t, c, today }: { t: Dict; c?: C; today: string }) {
  const M = t.mkt;
  const k = c?.id ?? "new";
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {c?.id && <input type="hidden" name="id" value={c.id} />}
      <div className="sm:col-span-2"><label className="label" htmlFor={`mc-name-${k}`}>{M.name}</label><input id={`mc-name-${k}`} name="name" className="input" required maxLength={200} defaultValue={c?.name ?? ""} /></div>
      <div><label className="label" htmlFor={`mc-ch-${k}`}>{M.channel}</label>
        <select id={`mc-ch-${k}`} name="channel" className="input" defaultValue={c?.channel ?? "meta"}>{CHANNELS.map((x) => <option key={x} value={x}>{M.channels[x]}</option>)}</select></div>
      <div><label className="label" htmlFor={`mc-st-${k}`}>{M.status}</label>
        <select id={`mc-st-${k}`} name="status" className="input" defaultValue={c?.status ?? "planned"}>{CAMPAIGN_STATUSES.map((x) => <option key={x} value={x}>{M.statuses[x]}</option>)}</select></div>
      <div><label className="label" htmlFor={`mc-from-${k}`}>{M.startOn}</label><input id={`mc-from-${k}`} name="start_on" type="date" className="input" required defaultValue={c?.start_on?.slice(0, 10) ?? today} /></div>
      <div><label className="label" htmlFor={`mc-to-${k}`}>{M.endOn}</label><input id={`mc-to-${k}`} name="end_on" type="date" className="input" defaultValue={c?.end_on?.slice(0, 10) ?? ""} /></div>
      <div><label className="label" htmlFor={`mc-budget-${k}`}>{M.budget}</label><input id={`mc-budget-${k}`} name="budget" className="input" dir="ltr" inputMode="decimal" defaultValue={c?.budget ? String(Number(c.budget)) : ""} /></div>
      <div><label className="label" htmlFor={`mc-spend-${k}`}>{M.spendManual}</label><input id={`mc-spend-${k}`} name="spend_manual" className="input" dir="ltr" inputMode="decimal" defaultValue={c?.spend_manual && Number(c.spend_manual) ? String(Number(c.spend_manual)) : ""} /></div>
      <div><label className="label" htmlFor={`mc-code-${k}`}>{M.discountCode}</label><input id={`mc-code-${k}`} name="discount_code" className="input" dir="ltr" maxLength={60} defaultValue={c?.discount_code ?? ""} /></div>
      <div className="sm:col-span-2 lg:col-span-3"><label className="label" htmlFor={`mc-goal-${k}`}>{M.goal}</label><input id={`mc-goal-${k}`} name="goal" className="input" maxLength={300} defaultValue={c?.goal ?? ""} /></div>
      <div className="sm:col-span-2 lg:col-span-4"><label className="label" htmlFor={`mc-notes-${k}`}>{M.notes}</label><input id={`mc-notes-${k}`} name="notes" className="input" maxLength={1000} defaultValue={c?.notes ?? ""} /></div>
    </div>
  );
}
