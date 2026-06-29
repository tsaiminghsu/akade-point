'use client';
import dynamic from 'next/dynamic';
import LoadingScreen from '@/components/city-game/LoadingScreen';

const CityGame = dynamic(() => import('@/components/city-game/CityGame'), {
  ssr: false,
  loading: () => <LoadingScreen progress={0} statusText="初始化 WebGL 3D 渲染引擎..." />,
});

export default function GtaCityPage() {
  return <CityGame />;
}

