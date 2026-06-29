"use client";
import dynamic from "next/dynamic";

const BallMachineGame = dynamic(
  () => import("@/components/ball-machine/BallMachineGame"),
  { ssr: false }
);

export default function TiaoDuoJiPage() {
  return <BallMachineGame />;
}
