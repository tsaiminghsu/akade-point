import dynamic from "next/dynamic";

const ScratchCardGenerator = dynamic(
  () => import("@/components/scratch-card/ScratchCardGenerator"),
  { ssr: false }
);

export default function ScratchCardPage() {
  return <ScratchCardGenerator />;
}
