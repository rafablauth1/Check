import {
  Zap, Gauge, Waves, Radio, SlidersHorizontal, Thermometer, Activity, Antenna,
  Cpu, Cable, Plug, Battery, Signal, Wifi, Ruler, Scale, Timer, FlaskConical,
  Magnet, Lightbulb, Sun, Wind, Droplet, Flame, Volume2, Speaker, Mic, Monitor,
  Box, Wrench, Cog, Power, Network, Microscope, CircuitBoard, BatteryCharging,
} from 'lucide-react'

// Registro de ícones disponíveis para os tipos de equipamento (escolhidos no app).
export const ICONES: Record<string, React.ElementType> = {
  Zap, Gauge, Waves, Radio, SlidersHorizontal, Thermometer, Activity, Antenna,
  Cpu, Cable, Plug, Battery, Signal, Wifi, Ruler, Scale, Timer, FlaskConical,
  Magnet, Lightbulb, Sun, Wind, Droplet, Flame, Volume2, Speaker, Mic, Monitor,
  Box, Wrench, Cog, Power, Network, Microscope, CircuitBoard, BatteryCharging,
}

export const ICON_NAMES = Object.keys(ICONES)

export function Icone({ name, size = 16, className, style }: {
  name?: string; size?: number; className?: string; style?: React.CSSProperties
}) {
  const C = (name && ICONES[name]) || Gauge
  return <C size={size} className={className} style={style} />
}
