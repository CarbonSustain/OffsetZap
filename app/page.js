import OffsetZapApp from '@/components/OffsetZapApp';
import SubAccountControls from '@/components/SubAccountControls';

export default function Home() {
  return (
    <main className="p-6">
      <OffsetZapApp />
      <div className="mt-6">
        <SubAccountControls />
      </div>
    </main>
  );
}

