import { useState } from "react";
import { Bookmark, Check, DoneDot, Download, PauseDot, Printer, Send, Spinner } from "./Icons.jsx";

const QUICK = [
  "Dig deeper into recent news",
  "Explain the RSI and moving averages in plain words",
  "Look for dividend or earnings news",
];

export function ReviewBar({ feedback, setFeedback, onRevise, onApprove, version, maxRevisions, approving }) {
  const left = Math.max(0, maxRevisions - (version - 1));
  const canRevise = left > 0;
  const submit = () => {
    if (canRevise && feedback.trim()) onRevise(feedback.trim());
  };

  return (
    <form
      className="review"
      aria-label="Review this brief"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          onApprove();
        }
      }}
    >
      <div className="review__head">
        <PauseDot size={22} />
        <strong>Paused for your review</strong>
        <span className="review__sub">Nothing is saved until you approve.</span>
        <div className="review__budget" aria-label={`${left} of ${maxRevisions} revisions left`}>
          <span className="review__dots" aria-hidden="true">
            {Array.from({ length: maxRevisions }, (_, i) => (
              <i key={i} className={i < left ? "is-left" : ""} />
            ))}
          </span>
          {canRevise ? `${left} revision${left === 1 ? "" : "s"} left` : "No revisions left"}
        </div>
      </div>

      <div className="review__row">
        <label htmlFor="hl-feedback" className="sr-only">What should the agents dig into?</label>
        <input
          id="hl-feedback"
          type="text"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder={canRevise ? "What should the agents dig into?" : "Revision limit reached: approve, or start new research"}
          autoComplete="off"
          disabled={!canRevise}
          aria-describedby="hl-review-keys"
        />
        {canRevise && (
          <button type="submit" className="btn btn--amber" disabled={!feedback.trim()}>
            Revise
          </button>
        )}
        <button type="button" className="btn btn--primary" onClick={onApprove} disabled={approving}>
          {approving ? <Spinner size={16} /> : <Check />} Approve and save
        </button>
      </div>

      <div className="review__foot">
        {canRevise && (
          <div className="review__chips">
            <span className="review__try">Try</span>
            {QUICK.map((q) => (
              <button key={q} type="button" className="chip chip--xs chip--amber" onClick={() => setFeedback(q)}>
                {q}
              </button>
            ))}
          </div>
        )}
        <span id="hl-review-keys" className="review__hint">Enter revises · Ctrl+Enter approves</span>
      </div>
    </form>
  );
}

export function ApprovedBar({ savedId, onDownload, onOpenSaved, onFollowUp }) {
  const [text, setText] = useState("");
  return (
    <div className="approved">
      <div className="approved__top">
        <DoneDot size={26} />
        <div className="review__copy approved__copy">
          <strong>{savedId ? "Approved and saved" : "Approved"}</strong>
          <span>
            {savedId ? (
              <>
                Stored in Saved briefs as <code>{savedId}</code>.
              </>
            ) : (
              "There was nothing to save for this question."
            )}
          </span>
        </div>
        <div className="approved__actions no-print">
          <button type="button" className="btn btn--outline btn--sm" onClick={onDownload}>
            <Download /> Markdown
          </button>
          <button type="button" className="btn btn--outline btn--sm" onClick={() => window.print()}>
            <Printer /> Print / PDF
          </button>
          {savedId && (
            <button type="button" className="btn btn--outline btn--sm" onClick={onOpenSaved}>
              <Bookmark width={16} height={16} /> Saved briefs
            </button>
          )}
        </div>
      </div>

      <form
        className="followup no-print"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onFollowUp(text.trim());
        }}
      >
        <label htmlFor="hl-followup" className="followup__label">Ask a follow-up in this thread</label>
        <div className="followup__row">
          <input
            id="hl-followup"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Now compare with CIMB"
            autoComplete="off"
          />
          <button type="submit" className="btn btn--primary" disabled={!text.trim()}>
            Ask <Send />
          </button>
        </div>
        <span className="note">The checkpointer keeps this thread&apos;s state, so the supervisor remembers the companies above.</span>
      </form>
    </div>
  );
}
