import {
  AlertCircle,
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  BarChart2,
  Bell,
  Building2,
  Calendar,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  CircleDollarSign,
  Coins,
  CreditCard,
  Download,
  Edit,
  History,
  Home,
  Info,
  Landmark,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Phone,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  TrendingUp,
  User,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  WifiOff,
  X,
  type LucideIcon,
} from 'lucide-react';

/**
 * Le registre est explicite, et c'est délibéré. Un composant qui résout ses
 * icônes par chaîne à l'exécution embarque le jeu Lucide entier — plus de mille
 * icônes — dans un paquet destiné à un téléphone en 3G. Ici, une icône non
 * déclarée est une erreur de compilation, et le paquet ne contient que ce que
 * les écrans dessinent réellement.
 */
const ICONES = {
  'alert-circle': AlertCircle,
  'arrow-down-right': ArrowDownRight,
  'arrow-left': ArrowLeft,
  'arrow-up-right': ArrowUpRight,
  'bar-chart-2': BarChart2,
  bell: Bell,
  'building-2': Building2,
  calendar: Calendar,
  check: Check,
  'check-circle': CheckCircle,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  'chevrons-up-down': ChevronsUpDown,
  'circle-dollar-sign': CircleDollarSign,
  coins: Coins,
  'credit-card': CreditCard,
  download: Download,
  edit: Edit,
  history: History,
  home: Home,
  info: Info,
  landmark: Landmark,
  'layout-dashboard': LayoutDashboard,
  'log-out': LogOut,
  'map-pin': MapPin,
  menu: Menu,
  'message-square': MessageSquare,
  'more-horizontal': MoreHorizontal,
  phone: Phone,
  plus: Plus,
  receipt: Receipt,
  'refresh-cw': RefreshCw,
  search: Search,
  settings: Settings,
  'shield-check': ShieldCheck,
  'sliders-horizontal': SlidersHorizontal,
  smartphone: Smartphone,
  'trending-up': TrendingUp,
  user: User,
  'user-check': UserCheck,
  'user-plus': UserPlus,
  users: Users,
  wallet: Wallet,
  'wifi-off': WifiOff,
  x: X,
} as const satisfies Record<string, LucideIcon>;

export type NomIcone = keyof typeof ICONES;

interface Props {
  nom: NomIcone;
  taille?: number;
  className?: string;
}

/** Design System §3.6 : jeu unique, trait 1,75 px, extrémités arrondies. */
export function Icone({ nom, taille = 18, className }: Props) {
  const Dessin = ICONES[nom];
  return <Dessin size={taille} strokeWidth={1.75} className={className} aria-hidden="true" />;
}
