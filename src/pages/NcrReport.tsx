import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Download, Loader2, Pencil, Printer } from 'lucide-react';
import { useStore } from '../store';
import { FsHeader } from './NcrForm';
import { fmtDMY, fmtDMYTime, NCR_STAGES, ncrCode, ncrHeaderFields } from '../lib/ncr';
import { byId } from '../lib/utils';

/** Printable single-NCR report (the edit page's Print button). */
export default function NcrReport() {
  const { id } = useParams();
  const { data } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const n = byId(data.ncrs, id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const back = () => navigate(`/ncr/${id}`, { state: location.state });

  if (!n) {
    return (
      <div className="fs">
        <FsHeader title={<b>Report not found</b>} onClose={() => navigate('/ncr')} />
        <main className="fs-body"><div className="card empty"><strong>This NCR doesn't exist.</strong><Link className="link" to="/ncr">Back to non conformances</Link></div></main>
      </div>
    );
  }
  const pdf = async () => {
    setBusy(true); setError('');
    try { (await import('../lib/ncrExport')).ncrPdf(n, data); } catch (err) { setError(err instanceof Error ? err.message : 'Could not create the PDF'); } finally { setBusy(false); }
  };
  const docs = data.attachments.filter((a) => a.entityType === 'ncr' && a.entityId === n.id);

  return (
    <div className="fs report-page">
      <FsHeader title={<><b>{ncrCode(n)}</b> report</>} onClose={back} extra={<>
        <button className="btn btn-light btn-sm" onClick={back}><Pencil size={14} /> Edit</button>
        <button className="btn btn-light btn-sm" onClick={() => window.print()}><Printer size={14} /> Print</button>
        <button className="btn btn-save btn-sm" onClick={pdf} disabled={busy}>{busy ? <Loader2 size={14} className="spin" /> : <Download size={14} />} Download PDF</button>
      </>} />
      <div className="fs-scroll">
        <main className="fs-body">
          {error && <div className="banner tone-bad">{error}</div>}
          <article className="report-sheet">
            <header className="rs-head">
              <div>
                <div className="small muted">{data.settings.companyName}</div>
                <h1>Non Conformance Report – {ncrCode(n)}</h1>
              </div>
              <span className={`rs-status ${n.closed ? 'closed' : 'open'}`}>{n.closed ? `Closed ${fmtDMY(n.closedDate)}` : 'Open / In progress'}</span>
            </header>
            <dl className="rs-fields">
              {ncrHeaderFields(n, data).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || '—'}</dd></div>)}
            </dl>
            {NCR_STAGES.map((s) => (
              <section key={s.key} className="rs-stage">
                <h2>{s.title}</h2>
                <p className="rs-text">{n[s.key] || <span className="muted">Not recorded</span>}</p>
                <div className="rs-sign"><span><b>{s.dateLabel}:</b> {fmtDMY(n[s.date]) || '—'}</span><span><b>{s.byLabel}:</b> {n[s.by] || '—'}</span></div>
              </section>
            ))}
            <section className="rs-stage rs-closure">
              <h2>Closure</h2>
              <div className="rs-sign four">
                <span><b>Closed date:</b> {fmtDMY(n.closedDate) || '—'}</span>
                <span><b>Closed by:</b> {n.closedBy || '—'}</span>
                <span><b>Closed position:</b> {n.closedPosition || '—'}</span>
                <span><b>Completed:</b> {n.closed ? 'Yes' : 'No'}</span>
              </div>
              <div className="rs-signature"><span>Signature</span><span>Date</span></div>
            </section>
            {docs.length > 0 && (
              <section className="rs-stage">
                <h2>Attached documents</h2>
                <ul className="rs-docs">{docs.map((a) => <li key={a.id}>{a.name} <span className="muted">· {fmtDMYTime(a.uploadedAt)} · {a.uploadedBy}</span></li>)}</ul>
              </section>
            )}
            <footer className="rs-foot small muted">Printed {fmtDMYTime(new Date().toISOString())} from Torqline</footer>
          </article>
        </main>
      </div>
    </div>
  );
}
