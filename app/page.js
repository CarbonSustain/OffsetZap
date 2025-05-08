import OffsetZapApp from './components/OffsetZapApp';
import SubAccountControls from './components/SubAccountControls';

export default function Home() {
  return (
    <main className="p-4">
      <OffsetZapApp />
      <div className="mt-6">
        <SubAccountControls />
      </div>
    </main>
  );
}

