import { create } from "zustand";

interface UIState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  mobileSidebarOpen: boolean;
  toggleMobileSidebar: () => void;
  setMobileSidebarOpen: (open: boolean) => void;

  drawerMachineId: string | null;
  openMachineDrawer: (machineId: string) => void;
  closeMachineDrawer: () => void;

  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  mobileSidebarOpen: false,
  toggleMobileSidebar: () => set((s) => ({ mobileSidebarOpen: !s.mobileSidebarOpen })),
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),

  drawerMachineId: null,
  openMachineDrawer: (machineId) => set({ drawerMachineId: machineId }),
  closeMachineDrawer: () => set({ drawerMachineId: null }),

  commandOpen: false,
  setCommandOpen: (open) => set({ commandOpen: open }),
}));
