import EmptyState from "./EmptyState";

export default function WaitingRepliesWorkspace() {
  return (
    <main className="ops-page">
      <div className="ops-page__inner">
        <header className="ops-page-header">
          <div>
            <p className="ops-page-header__eyebrow">External coordination</p>
            <h1>Waiting for Replies</h1>
            <p className="ops-page-header__detail">
              Shipment-critical requests remain separate from general
              notifications and evidence.
            </p>
          </div>
        </header>
        <section className="ops-section">
          <div className="ops-panel">
            <EmptyState
              title="Response tracking is not available"
              detail="The current Ophanim API does not store external organizations, contacts, requested confirmations, response deadlines, escalation status, or response-received events. This page intentionally does not manufacture reply records from alerts or shipment status."
            />
          </div>
        </section>
      </div>
    </main>
  );
}
