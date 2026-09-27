"use client";

import dynamic from "next/dynamic";

import { CanvasSkeleton } from "@/components/control-center/shared/LoadingSkeletons";

const LayoutEditor = dynamic(() => import("@/components/control-center/canvas/LayoutEditor"), {
  ssr: false,
  loading: () => <CanvasSkeleton />,
});

export default function ControlCenterEditorPage() {
  return <LayoutEditor />;
}
