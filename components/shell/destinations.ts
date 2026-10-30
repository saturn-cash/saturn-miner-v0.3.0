import { Activity, Cpu, Globe2, LayoutDashboard, Pickaxe, Settings, Stethoscope, Wallet } from 'lucide-react'

/**
 * Every screen is a place in the Saturn system. The camera flies there when you open it.
 * `label` is what the screen does; `place` is where you are.
 */
export const SCREENS = [
  { id: 'overview', label: 'Mission control', place: 'Saturn orbit', icon: LayoutDashboard, arrival: 'Rings lit, engines ready.' },
  { id: 'mining', label: 'Mining', place: 'The rings', icon: Pickaxe, arrival: 'Skimming billions of ice chunks. This is where the work happens.' },
  { id: 'wallet', label: 'Wallet', place: 'Titan', icon: Wallet, arrival: 'The only moon with a thick atmosphere. Your coins sit safe in the haze.' },
  { id: 'hardware', label: 'Hardware', place: 'Mimas', icon: Cpu, arrival: 'The Death Star moon. Your rigs dock in Herschel crater.' },
  { id: 'network', label: 'Network', place: 'Iapetus', icon: Globe2, arrival: 'The two-faced moon, far enough out to see every peer on the chain.' },
  { id: 'activity', label: 'Activity', place: 'Enceladus', icon: Activity, arrival: 'Ice geysers vent at the south pole. So does your event log.' },
  { id: 'diagnostics', label: 'Diagnostics', place: 'The hexagon', icon: Stethoscope, arrival: 'A six-sided storm wider than two Earths. Good spot for a system check.' },
  { id: 'settings', label: 'Settings', place: 'High orbit', icon: Settings, arrival: 'Quiet orbit. Adjust the ship.' },
] as const

export type ScreenId = (typeof SCREENS)[number]['id']

export function screenMeta(id: ScreenId) {
  return SCREENS.find((s) => s.id === id) ?? SCREENS[0]
}
