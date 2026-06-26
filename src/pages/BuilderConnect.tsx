/**
 * BuilderConnect.tsx — page wrapper for the connect-account flow (P5).
 * Guarded: connecting a cloud account requires a signed-in (Business) user.
 */

import ConnectAccount from '../builder/connect/ConnectAccount';

export default function BuilderConnect() {
  return (
    <div style={{ maxWidth: 760, margin: '40px auto', padding: '0 16px' }}>
      <ConnectAccount />
    </div>
  );
}
