import React, { useState, useEffect, useMemo, useRef } from 'react';
import { processBankScreenshots, reconcilePayments, type ReconciliationResult, type Candidate } from './services/reconciliationService';
import { syncPedidoLabel, releasePedidoLabel } from './services/labelingService';
import { FileCheck, ShieldAlert, FileSearch, AlertTriangle } from 'lucide-react';
import { PaymentHistoryTape } from './components/PaymentHistoryTape';
import { PanelPedidos } from './components/PanelPedidos';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { 
  Menu,
  Home,
  Wallet,
  Trophy, 
  LayoutGrid, 
  BarChart3, 
  Settings, 
  Search, 
  Crown, 
  Medal, 
  ThumbsUp, 
  MessageSquare, 
  Share2, 
  ArrowLeft, 
  Rocket, 
  Loader2,
  CheckCircle2,
  Check,
  AlertCircle,
  Minus,
  Divide,
  XCircle,
  Video,
  Users,
  User as UserIcon,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ExternalLink,
  Zap,
  Clock,
  History,
  Award,
  Hash,
  ChevronRight,
  ChevronDown,
  X,
  Plus,
  Pencil,
  Link2,
  Calendar,
  Calendar as CalendarIcon,
  DollarSign,
  Banknote,
  ShoppingCart,
  Camera,
  Lightbulb,
  LogOut,
  ChevronLeft,
  Filter,
  Trash2,
  Send,
  Gift,
  Home as HomeIcon,
  Utensils,
  Car,
  Wrench,
  ShoppingBag,
  Dog,
  GraduationCap,
  MoreHorizontal,
  Copy,
  Wallet as WalletIcon,
  CreditCard,
  Heart,
  Gamepad2,
  Coffee,
  Plane,
  Smartphone,
  Music,
  Briefcase,
  Pizza,
  Apple,
  IceCream,
  Candy,
  Beer,
  Wine,
  GlassWater,
  Bike,
  Bus,
  Train,
  Tv,
  Droplets,
  Wifi,
  Phone,
  Tag,
  Shield,
  Database,
  Stethoscope,
  Pill,
  Dumbbell,
  Scissors,
  Shirt,
  Watch,
  PartyPopper,
  Book,
  PenTool,
  Palette,
  Globe,
  Map,
  Flag,
  Star,
  Smile,
  Sun,
  Moon,
  Cloud,
  Umbrella,
  Wind,
  Flame,
  Leaf,
  Flower2,
  TreeDeciduous,
  Mountain,
  Waves,
  Anchor,
  Ship,
  Truck,
  Package,
  Milk,
  Martini,
  UtensilsCrossed,
  Soup,
  Cake,
  Music2,
  Cigarette,
  Dice5,
  Play,
  Film,
  Theater,
  Piano,
  Mic2,
  PlaneTakeoff,
  PlaneLanding,
  ParkingCircle,
  Fuel,
  Ticket,
  Luggage,
  Backpack,
  Sailboat,
  Building,
  Bed,
  Activity,
  PersonStanding,
  Swords,
  Megaphone,
  Scale,
  Building2,
  PiggyBank,
  Gem,
  CandlestickChart,
  Bitcoin,
  Store,
  ShoppingBasket,
  ShieldCheck,
  BriefcaseMedical,
  Flower,
  Sprout,
  Bath,
  ClipboardList,
  BookOpen,
  FileText,
  FlaskConical,
  Skull,
  HeartHandshake,
  PawPrint,
  Bone,
  Handshake,
  Rabbit,
  Baby,
  Accessibility,
  Mars,
  Venus,
  CloudRain,
  Snowflake,
  Thermometer,
  Volume2,
  Ear,
  Instagram,
  Diamond,
  SprayCan,
  Satellite,
  Cpu,
  Hammer,
  HardDrive,
  Mouse,
  Keyboard,
  Monitor,
  Speaker,
  Headphones,
  Mic,
  Radio,
  Disc,
  Coins,
  Euro,
  PoundSterling,
  JapaneseYen,
  Calculator,
  Eye,
  EyeOff,
  Printer,
  FileSpreadsheet
} from 'lucide-react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  eachDayOfInterval
} from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie
} from 'recharts';
import confetti from 'canvas-confetti';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { GoogleGenAI, Type } from "@google/genai";

const normalizeName = (name: string) => {
  if (!name) return "";
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9\s]/g, "") // Remove special chars
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
};

/**
 * Puente al sistema de etiquetas de Supabase. Reemplaza al viejo LabelEngine
 * que calculaba etiquetas en el navegador. Ahora PostgreSQL es el único árbitro.
 *
 * Uso: después de hacer commit del batch de Firebase con los cambios del pedido,
 * llamá a `syncLabelsForCustomer` para que Supabase asigne/migre/libere casilleros
 * y los escriba de vuelta en Firebase.
 */
async function syncLabelsForCustomer(
  customerId: string,
  updatedPedidos: Pedido[],
  allCustomers: any[]
): Promise<void> {
  if (!customerId) return;
  const customer = allCustomers.find(c => c.id === customerId);
  if (!customer) return;

  const customerPedidos = updatedPedidos.filter(p =>
    p.customerId === customerId ||
    (p.customerId === '' || p.customerId == null) &&
    cleanName(p.customerName ?? '') === cleanName(customer.name ?? '')
  );
  const deliveredPedidos = customerPedidos.filter(p => p.status.toLowerCase() === 'entregado');
  const activePedidos = customerPedidos.filter(p => p.status.toLowerCase() !== 'entregado');

  // 1. Liberar pedidos entregados
  for (const p of deliveredPedidos) {
    if (p.id.startsWith('temp-')) continue;
    try {
      await releasePedidoLabel(p.id, 'DELIVERED');
    } catch (e) {
      console.warn('[labels] release failed', p.id, e);
    }
  }

  // 2. Sincronizar pedidos activos (asigna o migra)
  const labelUpdates: Array<{ id: string; label: string; type: 'number' | 'letter' }> = [];
  for (const p of activePedidos) {
    if (p.id.startsWith('temp-')) continue;
    try {
      const result = await syncPedidoLabel({
        firebaseCustomerId: customerId,
        customerName: customer.name ?? p.customerName ?? '',
        customerNormalizedName: normalizeName(customer.name ?? p.customerName ?? ''),
        customerWhatsApp: customer.phone ?? null,
        firebasePedidoId: p.id,
        totalBags: p.bagCount || 1,
        totalItems: p.itemCount || 0,
        totalAmount: p.totalAmount || 0,
      });
      const type = /^\d+$/.test(result.containerCode) ? 'number' : 'letter';
      labelUpdates.push({ id: p.id, label: result.containerCode, type });
    } catch (e) {
      console.error('[labels] sync failed', p.id, e);
    }
  }

  // 3. Escribir etiquetas de vuelta a Supabase
  if (labelUpdates.length > 0) {
    await Promise.all(labelUpdates.map(u =>
      pedidosApi.update(u.id, { label: u.label, label_type: u.type })
        .catch(e => console.warn('[labels] write-back pedido', u.id, e))
    ));
    const primary = labelUpdates[0];
    await clientesApi.update(customerId, {
      active_label: primary.label,
      active_label_type: primary.type,
      label_updated_at: new Date().toISOString(),
    }).catch(e => console.warn('[labels] write-back customer', e));
  } else if (deliveredPedidos.length > 0 && activePedidos.length === 0) {
    await clientesApi.update(customerId, {
      active_label: '',
      active_label_type: '',
      label_updated_at: new Date().toISOString(),
    }).catch(e => console.warn('[labels] clear customer label', e));
  }
}

const HistoricalRepairEngine = {
  VERSION: 'v1',

  analyze: async (_recencyDays: number = 90) => {
    // Firebase legacy — desactivado en migración a Supabase
    return { resolved: { total: 0 }, manual: { total: 0 }, pending_auto: { total: 0 }, pending_manual: { total: 0 } };
  },

  repair: async (_recencyDays: number = 90, _limit: number = 0, onProgress?: (msg: string) => void) => {
    onProgress?.("Reparación no disponible — datos migrados a Supabase.");
  },

};


const cleanName = (name: string) => {
  if (!name) return "";
  let cleaned = name.trim();
  
  // 1. Eliminar sufijos (todo desde "te envió", "realizó un pago", o montos colgados)
  const suffixes = [
    /\s+te envi[oó].*$/i,
    /\s+te envi[oó].*$/i,
    /\s+te envi[oó].*$/i,
    /\s+te transfiri[oó].*$/i,
    /\s+realiz[oó] un pago.*$/i,
    /\s+bs\.?\s*\d+.*$/i
  ];
  suffixes.forEach(reg => { cleaned = cleaned.replace(reg, ""); });

  // 2. Eliminar prefijos bancarios
  const prefixes = [
    /^QR DE\s+/i,
    /^Recibiste un yapeo de\s+/i,
    /^Recibiste un yapeo\s+/i,
    /^Pago de\s+/i,
    /^Transferencia de\s+/i,
    /^Transf\.\s+/i,
    /^Sr\.\s+/i,
    /^Sra\.\s+/i
  ];
  prefixes.forEach(reg => { cleaned = cleaned.replace(reg, ""); });

  // 3. Limpiar acentos, números, símbolos y dejar en MAYÚSCULAS
  cleaned = cleaned.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  cleaned = cleaned.replace(/[0-9.,:-]/g, "").replace(/\s+/g, " ").toUpperCase().trim();

  // 4. ORDENAR PALABRAS (La clave profesional para vinculación infalible)
  // Esto hace que "MARIA FUENTES" y "FUENTES MARIA" sean lo mismo internamente
  return cleaned.split(' ').sort().filter(Boolean).join(' ').trim();
};

const getVisualName = (name: string) => {
  if (!name) return "";
  let cleaned = name;

  // 1. Eliminar montos y sufijos bancarios comunes
  const suffixes = [
    /\s+bs\.?\s*\d+.*$/i,
    /\s+monto\s*\d+.*$/i,
    /\s+\d+\s*bs.*$/i,
    /\s+te envi[oó].*$/i
  ];
  suffixes.forEach(reg => { cleaned = cleaned.replace(reg, ""); });

  // 2. Eliminar prefijos bancarios
  const prefixes = [
    /^QR DE\s+/i,
    /^Recibiste un yapeo de\s+/i,
    /^Recibiste un yapeo\s+/i,
    /^Pago de\s+/i,
    /^Transferencia de\s+/i,
    /^Transf\.\s+/i,
    /^Sr\.\s+/i,
    /^Sra\.\s+/i,
    /^QRD\s+/i,
    /^TE ENVIO\s+/i
  ];
  prefixes.forEach(reg => { cleaned = cleaned.replace(reg, ""); });

  // 3. Limpiar símbolos y dejar en MAYÚSCULAS, pero NO ordenar
  cleaned = cleaned.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  cleaned = cleaned.replace(/[0-9.,:-]/g, "").replace(/\s+/g, " ").toUpperCase().trim();

  return cleaned;
};

const cleanAmount = (val: any) => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  // Reemplazar coma por punto si es el separador decimal
  let cleaned = String(val).replace(',', '.');
  // Eliminar cualquier cosa que no sea número o punto
  cleaned = cleaned.replace(/[^0-9.]/g, '');
  // Manejar casos con múltiples puntos (ej. 1.000.00)
  const parts = cleaned.split('.');
  if (parts.length > 2) {
    // Si hay más de un punto, asumimos que los primeros son de miles
    cleaned = parts.slice(0, -1).join('') + '.' + parts.slice(-1);
  }
  return parseFloat(cleaned) || 0;
};

const getTS = (f: any) => {
  if (!f) return 0;
  const d = new Date(f);
  return isNaN(d.getTime()) ? 0 : d.getTime() / 1000;
};

const parseAppDate = (dateValue: any): Date | null => {
  if (!dateValue) return null;
  if (dateValue.seconds) return new Date(dateValue.seconds * 1000);
  if (dateValue.toDate && typeof dateValue.toDate === 'function') return dateValue.toDate();
  const d = new Date(dateValue);
  return isNaN(d.getTime()) ? null : d;
};

const formatAppDate = (dateValue: any): string => {
  const date = parseAppDate(dateValue);
  if (!date) return "Sin fecha";
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

const formatTransactionDate = (dateValue: any): string => {
  const date = parseAppDate(dateValue);
  if (!date) return "Sin fecha";
  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
};

import { DetailedAnalysis, type CategoryData } from './components/DetailedAnalysis';
const AdminTiendaView = React.lazy(() => import('./components/AdminTiendaView').then(m => ({ default: m.AdminTiendaView })));
import { authApi, clientesApi, pagosApi, pedidosApi, transaccionesApi, categoriasApi, livesApi, ideasApi, setAuthContext, clearAuthContext } from './lib/api';
import {
  db, collection, doc, addDoc, updateDoc, deleteDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp, writeBatch, increment,
  Timestamp, getDocFromServer, setCompatUserId,
} from './lib/firebase-compat';

// Supabase user shape (simplificado para la app)
interface SupabaseUser {
  id: string;
  email?: string;
}


// Types
interface LiveSession {
  id: string;
  title: string;
  scheduledAt: any;
  duration: number;
  status: 'scheduled' | 'live' | 'completed';
  notes?: string;
}

interface Giveaway {
  id: string;
  title: string;
  liveId: string;
  prize: string;
  status: 'active' | 'closed';
  winnerId?: string;
}

interface Order {
  id: string;
  customerName: string;
  whatsapp: string;
  total: number;
  items: string;
  status: 'pending' | 'paid' | 'shipped' | 'delivered';
  paymentMethod: string;
  date: any;
}

interface Item {
  id: string;
  name: string;
  amount: number;
  category: any;
}

interface Transaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  subcategory?: string;
  description: string;
  date: any;
  isOcr?: boolean;
  account?: string;
  beneficiary?: string;
  tags?: string;
  status?: 'paid' | 'pending';
  isRecurring?: boolean;
}

const FINANCE_CATEGORIES = [
  'Comida', 'Transporte', 'Casa', 'Ropa', 'Educación', 
  'Entretenimiento', 'Servicios', 'Deudas', 'Seguro', 
  'Impuestos', 'Personal', 'Otros'
];

interface Payment {
  id: string;
  nombre: string;
  pago: number;
  date: any;
  status?: string;
  method?: string;
  verified?: boolean;
  customerId?: string;
}

interface Customer {
  id: string;
  name: string;
  canonicalName?: string;
  phone: string;
  activeLabel: string;
  totalSpent: number;
  totalItems: number;
  pendingItems: number;
  deliveredItems: number;
  createdAt: any;
}

interface Pedido {
  id: string;
  customerId: string;
  customerName?: string;
  date: any;
  itemCount: number;
  bagCount: number;
  label: string;
  labelType?: string;
  totalAmount: number;
  status: string;
  paymentIds?: string[];
}

interface Idea {
  id: string;
  content: string;
  createdAt: any;
  category?: string;
}

interface Subcategory {
  id: string;
  name: string;
  icon: string;
}

interface Category {
  id: string;
  name: string;
  icon: string;
  type: 'income' | 'expense';
  color: string;
  subcategories: Subcategory[];
}

const CATEGORY_ICONS: { [key: string]: any } = {
  Home: HomeIcon,
  Utensils: Utensils,
  Car: Car,
  Wrench: Wrench,
  ShoppingBag: ShoppingBag,
  Dog: Dog,
  GraduationCap: GraduationCap,
  MoreHorizontal: MoreHorizontal,
  Wallet: WalletIcon,
  TrendingUp: TrendingUp,
  CreditCard: CreditCard,
  Heart: Heart,
  Gamepad2: Gamepad2,
  Coffee: Coffee,
  Plane: Plane,
  Smartphone: Smartphone,
  Music: Music,
  Briefcase: Briefcase,
  Plus: Plus,
  ShoppingCart: ShoppingCart,
  Pizza: Pizza,
  Apple: Apple,
  IceCream: IceCream,
  Candy: Candy,
  Beer: Beer,
  Wine: Wine,
  GlassWater: GlassWater,
  Bike: Bike,
  Bus: Bus,
  Train: Train,
  SmartphoneIcon: Smartphone,
  MusicIcon: Music,
  Gamepad: Gamepad2,
  Tv: Tv,
  Zap: Zap,
  Droplets: Droplets,
  Wifi: Wifi,
  Phone: Phone,
  Shield: Shield,
  Stethoscope: Stethoscope,
  Pill: Pill,
  Dumbbell: Dumbbell,
  Scissors: Scissors,
  Shirt: Shirt,
  Watch: Watch,
  Gift: Gift,
  PartyPopper: PartyPopper,
  Camera: Camera,
  Book: Book,
  PenTool: PenTool,
  Palette: Palette,
  Globe: Globe,
  Map: Map,
  Flag: Flag,
  Star: Star,
  Smile: Smile,
  Sun: Sun,
  Moon: Moon,
  Cloud: Cloud,
  Umbrella: Umbrella,
  Wind: Wind,
  Flame: Flame,
  Leaf: Leaf,
  Flower2: Flower2,
  TreeDeciduous: TreeDeciduous,
  Mountain: Mountain,
  Waves: Waves,
  Anchor: Anchor,
  Ship: Ship,
  Truck: Truck,
  Package: Package,
  Hammer: Hammer,
  Tool: Wrench,
  Cpu: Cpu,
  HardDrive: HardDrive,
  Mouse: Mouse,
  Keyboard: Keyboard,
  Monitor: Monitor,
  Speaker: Speaker,
  Headphones: Headphones,
  Mic: Mic,
  Radio: Radio,
  Disc: Disc,
  Film: Film,
  Ticket: Ticket,
  Coins: Coins,
  Banknote: Banknote,
  DollarSign: DollarSign,
  Euro: Euro,
  PoundSterling: PoundSterling,
  JapaneseYen: JapaneseYen,
  Bitcoin: Bitcoin,
  CreditCardIcon: CreditCard,
  PiggyBank: PiggyBank,
  Calculator: Calculator,
  PieChart: BarChart3,
  LineChart: BarChart3,
  Activity: TrendingUp,
  Target: Award,
  Trophy: Trophy,
  Medal: Medal,
  Award: Award,
  CheckCircle: CheckCircle2,
  AlertCircle: ThumbsUp,
  HelpCircle: MessageSquare,
  Info: MessageSquare,
  Settings: Settings,
  User: UserIcon,
  Users: Users,
  Mail: Send,
  Bell: Zap,
  Lock: Crown,
  Unlock: Crown,
  Key: Crown,
  Eye: Eye,
  EyeOff: EyeOff,
  Search: Search,
  Filter: Filter,
  Trash: Trash2,
  Edit: Pencil,
  Save: ThumbsUp,
  Download: ThumbsUp,
  Upload: ThumbsUp,
  Share: Share2,
  Link: ExternalLink,
  Copy: RefreshCw,
  Refresh: RefreshCw,
  Clock: Clock,
  History: History,
  Calendar: CalendarIcon,
  MapPin: Map,
  Navigation: Map,
  Compass: Map,
  Layers: LayoutGrid,
  Grid: LayoutGrid,
  List: Menu,
  Menu: Menu,
  LogOut: LogOut,
  LogIn: Rocket,
  UserPlus: Users,
  UserMinus: Users,
  UserCheck: Users,
  UserX: Users,
  Milk: Milk,
  Martini: Martini,
  UtensilsCrossed: UtensilsCrossed,
  Soup: Soup,
  Cake: Cake,
  Music2: Music2,
  Cigarette: Cigarette,
  Dice5: Dice5,
  Play: Play,
  Theater: Theater,
  Piano: Piano,
  Mic2: Mic2,
  PlaneTakeoff: PlaneTakeoff,
  PlaneLanding: PlaneLanding,
  ParkingCircle: ParkingCircle,
  Fuel: Fuel,
  Luggage: Luggage,
  Backpack: Backpack,
  Sailboat: Sailboat,
  Building: Building,
  Bed: Bed,
  PersonStanding: PersonStanding,
  Swords: Swords,
  Megaphone: Megaphone,
  Scale: Scale,
  Building2: Building2,
  Gem: Gem,
  CandlestickChart: CandlestickChart,
  Store: Store,
  ShoppingBasket: ShoppingBasket,
  ShieldCheck: ShieldCheck,
  BriefcaseMedical: BriefcaseMedical,
  Flower: Flower,
  Sprout: Sprout,
  Bath: Bath,
  ClipboardList: ClipboardList,
  BookOpen: BookOpen,
  FileText: FileText,
  FlaskConical: FlaskConical,
  Skull: Skull,
  HeartHandshake: HeartHandshake,
  PawPrint: PawPrint,
  Bone: Bone,
  Handshake: Handshake,
  Rabbit: Rabbit,
  Baby: Baby,
  Accessibility: Accessibility,
  Mars: Mars,
  Venus: Venus,
  CloudRain: CloudRain,
  Snowflake: Snowflake,
  Thermometer: Thermometer,
  Volume2: Volume2,
  Ear: Ear,
  Instagram: Instagram,
  Diamond: Diamond,
  SprayCan: SprayCan,
  Satellite: Satellite,
};

const ICON_GROUPS = [
  {
    name: 'Comida y bebida',
    icons: ['Milk', 'Utensils', 'Coffee', 'Martini', 'UtensilsCrossed', 'Pizza', 'Soup', 'Apple', 'IceCream', 'Cake', 'Wine', 'Beer']
  },
  {
    name: 'Entretenimiento',
    icons: ['Music2', 'Cigarette', 'Dice5', 'Music', 'Headphones', 'Play', 'Film', 'Gamepad2', 'Theater', 'Piano', 'Radio', 'Mic2', 'Speaker', 'Flame']
  },
  {
    name: 'Transporte',
    icons: ['Car', 'Bike', 'Truck', 'Bus', 'Train', 'Ship', 'Plane', 'PlaneTakeoff', 'PlaneLanding', 'ParkingCircle', 'Fuel', 'Zap', 'Wrench', 'Hammer', 'Briefcase']
  },
  {
    name: 'Viajes',
    icons: ['Ticket', 'Luggage', 'Backpack', 'Sailboat', 'Home', 'Building', 'Bed', 'Umbrella', 'Globe', 'Navigation']
  },
  {
    name: 'Deporte',
    icons: ['Dumbbell', 'Waves', 'Activity', 'Mountain', 'Trophy', 'Wind', 'PersonStanding', 'Medal', 'Swords', 'Users', 'Megaphone']
  },
  {
    name: 'Finanzas',
    icons: ['Banknote', 'Scale', 'Building2', 'Wallet', 'BarChart3', 'Coins', 'CreditCard', 'PiggyBank', 'RefreshCw', 'Phone', 'Gem', 'CandlestickChart', 'Bitcoin']
  },
  {
    name: 'Compras',
    icons: ['Shirt', 'Gift', 'Tag', 'ShoppingBag', 'Store', 'ShoppingCart', 'ShoppingBasket']
  },
  {
    name: 'Salud',
    icons: ['ShieldCheck', 'BriefcaseMedical', 'Pill', 'Stethoscope', 'Heart', 'Activity', 'Droplets', 'Leaf', 'Flower', 'Sprout', 'UserIcon', 'Bath']
  },
  {
    name: 'Educación',
    icons: ['GraduationCap', 'ClipboardList', 'Book', 'BookOpen', 'FileText', 'Video', 'FlaskConical', 'Rocket']
  },
  {
    name: 'Amor y relaciones',
    icons: ['Heart', 'Skull', 'Shield', 'HeartHandshake', 'PawPrint', 'Bone', 'Smile', 'Handshake', 'Rabbit', 'Crown', 'Baby', 'Accessibility', 'Search', 'Mars', 'Venus']
  },
  {
    name: 'Clima',
    icons: ['Sun', 'Moon', 'CloudRain', 'Cloud', 'Snowflake', 'Thermometer', 'Waves', 'Wind']
  },
  {
    name: 'Otro',
    icons: ['Wifi', 'Volume2', 'Ear', 'Instagram', 'Diamond', 'Flame', 'SprayCan', 'Satellite', 'Cpu']
  }
];

const DEFAULT_EXPENSE_CATEGORIES: Omit<Category, 'id'>[] = [
  { 
    name: 'Casa', icon: 'Home', type: 'expense', color: '#f1f5f9',
    subcategories: [
      { id: 'casa_1', name: 'Alquiler', icon: 'Home' },
      { id: 'casa_2', name: 'Mantenimiento', icon: 'Wrench' },
      { id: 'casa_3', name: 'Muebles', icon: 'LayoutGrid' }
    ]
  },
  { 
    name: 'Alimentos', icon: 'Utensils', type: 'expense', color: '#f1f5f9',
    subcategories: [
      { id: 'alim_1', name: 'Supermercado', icon: 'ShoppingCart' },
      { id: 'alim_2', name: 'Restaurante', icon: 'Utensils' },
      { id: 'alim_3', name: 'Café', icon: 'Coffee' }
    ]
  },
  { 
    name: 'Transporte', icon: 'Car', type: 'expense', color: '#f1f5f9',
    subcategories: [
      { id: 'trans_1', name: 'Gasolina', icon: 'Zap' },
      { id: 'trans_2', name: 'Mantenimiento', icon: 'Wrench' },
      { id: 'trans_3', name: 'Seguro', icon: 'Shield' }
    ]
  },
];

const DEFAULT_INCOME_CATEGORIES: Omit<Category, 'id'>[] = [
  { 
    name: 'Salario', icon: 'Wallet', type: 'income', color: '#f1f5f9',
    subcategories: [
      { id: 'sal_1', name: 'Sueldo Base', icon: 'Wallet' },
      { id: 'sal_2', name: 'Bonos', icon: 'Gift' },
      { id: 'sal_3', name: 'Horas Extra', icon: 'Clock' }
    ]
  },
  { 
    name: 'Ventas', icon: 'TrendingUp', type: 'income', color: '#f1f5f9',
    subcategories: [
      { id: 'vent_1', name: 'Productos', icon: 'Package' },
      { id: 'vent_2', name: 'Servicios', icon: 'Briefcase' },
      { id: 'vent_3', name: 'Comisiones', icon: 'Coins' }
    ]
  },
  { 
    name: 'Otros', icon: 'Plus', type: 'income', color: '#f1f5f9',
    subcategories: [
      { id: 'otro_inc_1', name: 'Varios', icon: 'Plus' },
      { id: 'otro_inc_2', name: 'Intereses', icon: 'TrendingUp' },
      { id: 'otro_inc_3', name: 'Regalos', icon: 'Gift' }
    ]
  },
];

const COLORS = ['#ff2d55', '#ff85a2', '#69c9d0', '#010101', '#ff0050'];

// Components
const Logo = () => (
  <div className="flex items-center gap-3 select-none">
    <div className="w-12 h-12 rounded-2xl bg-brand flex items-center justify-center shadow-[0_8px_20px_rgba(255,45,120,0.3)]">
      <Video className="text-white w-6 h-6" />
    </div>
    <div className="flex flex-col leading-tight">
      <span className="text-xl font-extrabold tracking-tight text-base-text">Ventas</span>
      <span className="text-xl font-extrabold tracking-tight text-brand">Live</span>
    </div>
  </div>
);

const TabButton = ({ active, icon: Icon, onClick }: any) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center justify-center flex-1 py-2.5 transition-all relative ${active ? 'text-brand' : 'text-base-text-muted'}`}
  >
    <div className={`p-2 rounded-xl transition-all ${active ? 'bg-brand/10' : ''}`}>
      <Icon className={`w-6 h-6 ${active ? 'scale-110' : 'scale-100'}`} />
    </div>
    {active && (
      <motion.div 
        layoutId="tab-indicator" 
        className="absolute bottom-2 w-1 h-1 bg-brand rounded-full" 
      />
    )}
  </button>
);

export default function App() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState<'home' | 'entrega' | 'payments' | 'finance' | 'tienda' | 'settings' | 'panel_pedidos'>('home');
  const [selectedPaymentDates, setSelectedPaymentDates] = useState<Date[]>([new Date()]);
  const [selectedPaymentTime, setSelectedPaymentTime] = useState<string>("");
  const [isPaymentCalendarOpen, setIsPaymentCalendarOpen] = useState(false);
  // Data States
  const [lives, setLives] = useState<LiveSession[]>([]);
  const [giveaways, setGiveaways] = useState<Giveaway[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [savedIdeas, setSavedIdeas] = useState<Idea[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  
  // UI States
  const [showAddModal, setShowAddModal] = useState<string | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkingCustomer, setLinkingCustomer] = useState<any>(null);
  const [editingTransaction, setEditingTransaction] = useState<any>(null);
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [showPaymentMethodModal, setShowPaymentMethodModal] = useState(false);
  const [showPeopleModal, setShowPeopleModal] = useState(false);
  const [showReconciliationModal, setShowReconciliationModal] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [loadingData, setLoadingData] = useState(false);

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [showAllPayments, setShowAllPayments] = useState(false);
  const [hideCompletedWork, setHideCompletedWork] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
      console.log('PWA: beforeinstallprompt disparado');
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`PWA: Usuario eligió ${outcome}`);
    setDeferredPrompt(null);
    setIsInstallable(false);
  };

  // Restaurar sesión desde localStorage al iniciar
  useEffect(() => {
    const saved = localStorage.getItem('sb_session');
    if (saved) {
      try {
        const { user: u, token } = JSON.parse(saved);
        setUser(u);
        setAuthToken(token);
        setAuthContext(u.id, token);
        setCompatUserId(u.id);
      } catch {
        localStorage.removeItem('sb_session');
      }
    }
    setLoading(false);
  }, []);

  const loadData = async () => {
    if (!user) return;
    try {
      const [
        rawClientes,
        rawPagos,
        rawPedidos,
        rawTx,
        rawCats,
        rawLives,
        rawIdeas,
      ] = await Promise.all([
        clientesApi.list(),
        pagosApi.list(),
        pedidosApi.list(),
        transaccionesApi.list(),
        categoriasApi.list(),
        livesApi.list(),
        ideasApi.list(),
      ]);

      // Normalizar clientes al shape esperado por la app
      setCustomers(rawClientes.map((c: any) => ({
        id: String(c.id),
        name: c.full_name,
        canonicalName: c.canonical_name ?? c.normalized_name,
        phone: c.phone ?? '',
        activeLabel: c.active_label ?? '',
        activeLabelType: c.active_label_type ?? '',
        totalSpent: c.total_spent ?? 0,
        totalItems: c.total_items ?? 0,
        pendingItems: c.pending_items ?? 0,
        deliveredItems: c.delivered_items ?? 0,
      })));

      // Normalizar pagos
      setPayments(rawPagos.map((p: any) => ({
        id: String(p.id),
        nombre: p.nombre,
        pago: Number(p.pago),
        date: p.date,
        status: p.status,
        method: p.method,
        verified: p.verified,
        customerId: p.customer_id ? String(p.customer_id) : undefined,
      })).sort((a: any, b: any) => {
        const tA = parseAppDate(a.date)?.getTime() || 0;
        const tB = parseAppDate(b.date)?.getTime() || 0;
        return tB - tA;
      }));

      // Normalizar pedidos
      setPedidos(rawPedidos.map((p: any) => ({
        id: String(p.id),
        customerId: p.customer_id ? String(p.customer_id) : '',
        customerName: p.customer_name ?? '',
        itemCount: p.item_count ?? 0,
        bagCount: p.bag_count ?? 1,
        label: p.label ?? '',
        labelType: p.label_type ?? '',
        status: p.status ?? 'procesar',
        totalAmount: Number(p.total_amount ?? 0),
        date: p.date,
        labelVersion: p.label_version ?? 1,
      })));

      // Transacciones
      setTransactions(rawTx.map((t: any) => ({
        id: String(t.id),
        type: t.type,
        amount: Number(t.amount),
        category: t.category,
        subcategory: t.subcategory,
        description: t.description,
        date: t.fecha,
        isOcr: t.is_ocr,
        account: t.account,
        beneficiary: t.beneficiary,
        tags: t.tags,
        status: t.status,
        isRecurring: t.is_recurring,
      })).sort((a: any, b: any) => {
        const tA = parseAppDate(a.date)?.getTime() || 0;
        const tB = parseAppDate(b.date)?.getTime() || 0;
        return tB - tA;
      }));

      // Categorías
      if (rawCats.length === 0) {
        for (const cat of [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES]) {
          await categoriasApi.create(cat);
        }
        const refreshed = await categoriasApi.list();
        setCategories(refreshed.map((c: any) => ({
          id: String(c.id),
          name: c.name,
          type: c.type,
          icon: c.icon,
          color: c.color,
          subcategories: c.subcategories ?? [],
        })));
      } else {
        setCategories(rawCats.map((c: any) => ({
          id: String(c.id),
          name: c.name,
          type: c.type,
          icon: c.icon,
          color: c.color,
          subcategories: c.subcategories ?? [],
        })));
      }

      // Lives
      setLives(rawLives.map((l: any) => ({
        id: String(l.id),
        title: l.title,
        scheduledAt: l.scheduled_at,
        duration: l.duration,
        status: l.status,
        notes: l.notes,
      })));

      // Ideas
      setSavedIdeas(rawIdeas.map((i: any) => ({
        id: String(i.id),
        content: i.content,
        category: i.category,
        createdAt: i.created_at,
      })));

      // orders ya no se usan (legacy Firebase), queda vacío
      setOrders([]);
      setGiveaways([]);

    } catch (err) {
      console.error('[loadData] Error cargando datos:', err);
    }
  };

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const people = useMemo(() => {
    const groups: { [key: string]: any } = {};
    
    // Initialize groups from customers to ensure all known customers are present
    customers.forEach((c: any) => {
      const groupKey = c.id; // Use ID as primary key
      groups[groupKey] = {
        nombre: c.name,
        total: 0,
        count: 0,
        lastDate: new Date(0).toISOString(),
        phone: c.phone || '',
        customerId: c.id,
        payments: [],
        pedidos: [],
        orders: []
      };
    });

    // Process all payments
    payments.forEach((p: any) => {
      const rawName = p.nombre || 'Sin nombre';
      const cleanedName = cleanName(rawName);
      
      // Try to find customer by ID first, then by canonical name
      const customer = customers.find((c: any) => (p.customerId && c.id === p.customerId) || cleanName(c.name) === cleanedName);
      
      const groupKey = customer ? customer.id : cleanedName;
      
      if (!groups[groupKey]) {
        groups[groupKey] = {
          id: groupKey,
          nombre: rawName,
          total: 0,
          count: 0,
          lastDate: p.fecha || p.date,
          phone: '',
          customerId: null,
          payments: [],
          pedidos: [],
          orders: []
        };
      }
      
      // Name selection logic: Prefer the visual (non-sorted) name for display
      const currentName = groups[groupKey].nombre;
      const candidateName = customer ? customer.name : rawName;
      const visualCandidate = getVisualName(candidateName);
      
      if (visualCandidate && visualCandidate !== cleanName(visualCandidate)) {
        groups[groupKey].nombre = visualCandidate;
      } else if (!currentName || currentName === cleanName(currentName)) {
        groups[groupKey].nombre = visualCandidate || currentName;
      }

      if (customer) {
        groups[groupKey].customerId = customer.id;
        groups[groupKey].id = customer.id;
      }

      const amount = cleanAmount(p.pago);
      groups[groupKey].total += amount;
      groups[groupKey].count += 1;
      groups[groupKey].payments.push({ ...p, pago: amount, date: p.fecha || p.date });
      
      const currentLast = parseAppDate(groups[groupKey].lastDate) || new Date(0);
      const pDate = parseAppDate(p.fecha || p.date) || new Date(0);
      if (pDate > currentLast) {
        groups[groupKey].lastDate = p.fecha || p.date;
      }
    });

    // Link pedidos to these groups
    pedidos.forEach((ped: any) => {
      const cleanedPedName = cleanName(ped.customerName || '');
      const customer = customers.find(c => (ped.customerId && c.id === ped.customerId) || (ped.customerName && cleanName(c.name) === cleanedPedName));
      
      const groupKey = customer ? customer.id : cleanedPedName;

      if (groupKey && groups[groupKey]) {
        groups[groupKey].pedidos.push(ped);
      } else if (groupKey) {
        groups[groupKey] = {
          nombre: ped.customerName || 'Sin nombre',
          total: 0,
          count: 0,
          lastDate: ped.date,
          phone: '',
          customerId: null,
          payments: [],
          pedidos: [ped],
          orders: []
        };
      }
    });

    // Link orders to these groups
    orders.forEach((ord: any) => {
      const cleanedOrdName = cleanName(ord.customerName || '');
      const customer = customers.find(c => (ord.customerId && c.id === ord.customerId) || (ord.customerName && cleanName(c.name) === cleanedOrdName));
      
      const groupKey = customer ? customer.id : cleanedOrdName;

      if (groupKey && groups[groupKey]) {
        if (!groups[groupKey].orders) groups[groupKey].orders = [];
        groups[groupKey].orders.push(ord);
      } else if (groupKey) {
        groups[groupKey] = {
          nombre: ord.customerName || 'Sin nombre',
          total: 0,
          count: 0,
          lastDate: ord.date || ord.fecha,
          phone: '',
          customerId: null,
          payments: [],
          pedidos: [],
          orders: [ord]
        };
      }
    });

    return Object.values(groups)
      .filter((p: any) => {
        // User wants them gone if they have no payments
        const hasPayments = p.payments.length > 0;
        if (hasPayments) return true;
        
        // If no payments, only show if it's a very new customer (less than 2 mins)
        if (p.customerId) {
          const customer = customers.find((c: any) => c.id === p.customerId);
          if (customer) {
            let created = 0;
            if (customer.createdAt) {
              if (typeof customer.createdAt === 'string') {
                created = new Date(customer.createdAt).getTime();
              } else if (customer.createdAt.toDate) {
                created = customer.createdAt.toDate().getTime();
              } else if (customer.createdAt.seconds) {
                created = customer.createdAt.seconds * 1000;
              }
            }
            return (Date.now() - created) < 120000; 
          }
        }
        return false;
      })
      .sort((a: any, b: any) => b.total - a.total);
  }, [payments, customers, pedidos, orders]);

  const selectedPerson = useMemo(() => {
    if (!selectedPersonId) return null;
    return people.find(p => p.customerId === selectedPersonId || cleanName(p.nombre) === selectedPersonId);
  }, [people, selectedPersonId]);

  // Auto-cleanup orphaned customers
  useEffect(() => {
    if (loading || !user || customers.length === 0) return;

    const cleanupOrphanedCustomers = async () => {
      for (const customer of customers) {
        // Find if this customer has any data in our 'people' aggregation
        const cleanedName = cleanName(customer.name);
        const groupKey = cleanedName.split(' ').sort().join(' ').trim();
        const personData = people.find(p => {
          const pKey = cleanName(p.nombre).split(' ').sort().join(' ').trim();
          return pKey === groupKey;
        });

        const hasPayments = personData && personData.payments.length > 0;

        if (!hasPayments) {
          // Check if it's not a brand new customer (to avoid deleting while adding)
          let created = 0;
          if (customer.createdAt) {
            if (typeof customer.createdAt === 'string') {
              created = new Date(customer.createdAt).getTime();
            } else if (customer.createdAt.toDate) {
              created = customer.createdAt.toDate().getTime();
            } else if (customer.createdAt.seconds) {
              created = customer.createdAt.seconds * 1000;
            }
          }
          
          const now = Date.now();
          
          // If created more than 10 seconds ago and has no payments, delete
          // Reduced grace period for faster cleanup as requested
          if (now - created > 10000) {
            try {
              // Delete the customer document
              await deleteDoc(doc(db, 'customers', customer.id));
              
              // Also delete any orphaned pedidos/orders for this customer to be "completely" gone
              if (personData) {
                const batch = writeBatch(db);
                personData.pedidos.forEach((ped: any) => {
                  batch.delete(doc(db, 'pedidos', ped.id));
                });
                if (personData.orders) {
                  personData.orders.forEach((ord: any) => {
                    batch.delete(doc(db, 'orders', ord.id));
                  });
                }
                await batch.commit();
              }
              
              console.log(`Auto-deleted orphaned customer and data: ${customer.name}`);
            } catch (err) {
              console.error("Error in auto-cleanup:", err);
            }
          }
        }
      }
    };

    const timer = setTimeout(cleanupOrphanedCustomers, 1000);
    return () => clearTimeout(timer);
  }, [payments, pedidos, orders, customers, people, loading, user]);

  const [loginError, setLoginError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      const result = await authApi.login(email, password);
      const token = result.session?.access_token ?? '';
      const u: SupabaseUser = { id: result.user.id, email: result.user.email };
      setAuthContext(u.id, token);
      setCompatUserId(u.id);
      setUser(u);
      setAuthToken(token);
      localStorage.setItem('sb_session', JSON.stringify({ user: u, token }));
    } catch (err: any) {
      console.error(err);
      setLoginError('Credenciales inválidas o usuario no encontrado.');
    }
  };

  const handleResetPassword = async () => {
    setLoginError('Para restablecer la contraseña contactá al administrador.');
  };

  const handleLogout = () => {
    authApi.logout().catch(() => {});
    clearAuthContext();
    setCompatUserId(null);
    setUser(null);
    setAuthToken(null);
    localStorage.removeItem('sb_session');
  };

  const handleOcr = async (e: React.ChangeEvent<HTMLInputElement>, type: 'transaction' | 'payment' | 'quick' = 'transaction') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOcrLoading(true);
    setOcrResult(null);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
        
        let prompt = "";
        if (type === 'quick') {
          prompt = "Analiza esta captura de pantalla (puede ser un perfil de WhatsApp, un chat o un recibo). Extrae el nombre del cliente, su número de WhatsApp (si está visible), el monto del pago y la fecha. Responde en formato JSON: { name: string, phone: string, amount: number, date: string }. Si algún dato no está, deja el campo vacío o 0.";
        } else {
          prompt = "Analiza esta captura de pantalla de una transferencia bancaria. Extrae el monto, la fecha y el nombre del remitente. Responde en formato JSON: { amount: number, date: string, description: string }. Si no es una transferencia, responde con un error.";
        }

        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [
            {
              parts: [
                { text: prompt },
                { inlineData: { mimeType: file.type, data: base64 } }
              ]
            }
          ]
        });

        const text = response.text;
        const jsonMatch = text?.match(/\{.*\}/s);
        if (jsonMatch) {
          try {
            const data = JSON.parse(jsonMatch[0]);
            
            if (type === 'quick') {
              const cleanedName = cleanName(data.name);
              
              // If data is incomplete or ambiguous, redirect to manual entry with prefilled data
              if (!data.name || data.amount <= 0) {
                setEditingPayment({
                  nombre: data.name?.toUpperCase() || '',
                  pago: data.amount || 0,
                  date: data.date || new Date().toISOString(),
                  phone: data.phone || ''
                });
                setShowPaymentMethodModal(false);
                setShowAddModal('payment');
                return;
              }

              // 1. Get or create customer
              const customersRef = collection(db, 'customers');
              let customerId = "";
              
              // Try to find by phone if provided
              if (data.phone) {
                const qPhone = query(customersRef, where('phone', '==', data.phone), limit(1));
                const snapPhone = await getDocs(qPhone);
                if (!snapPhone.empty) {
                  customerId = snapPhone.docs[0].id;
                }
              }
              
              // If not found by phone, try by name
              if (!customerId) {
                const qName = query(customersRef, where('canonicalName', '==', cleanedName), limit(1));
                const snapName = await getDocs(qName);
                if (!snapName.empty) {
                  customerId = snapName.docs[0].id;
                  // Update phone if we have it now
                  if (data.phone) {
                    await updateDoc(doc(db, 'customers', customerId), { phone: data.phone });
                  }
                } else {
                  // Create new customer
                  const newCust = await addDoc(customersRef, {
                    name: data.name.toUpperCase(),
                    canonicalName: cleanedName,
                    phone: data.phone || '',
                    createdAt: serverTimestamp(),
                    totalPaid: 0
                  });
                  customerId = newCust.id;
                }
              }

              // 2. Create payment
              if (data.amount > 0) {
                await addDoc(collection(db, 'pagos'), {
                  nombre: data.name.toUpperCase(),
                  customerId,
                  pago: data.amount,
                  date: data.date || new Date().toISOString(),
                  createdAt: serverTimestamp()
                });
              }

              setOcrResult({ ...data, customerId });
              confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#ff2d55', '#10b981'] });
            } else if (type === 'transaction') {
              const cleanedDesc = cleanName(data.description);
              await addDoc(collection(db, 'transactions'), {
                type: 'income',
                amount: data.amount,
                category: 'Venta Live',
                description: `OCR: ${cleanedDesc}`,
                fecha: serverTimestamp(),
                isOcr: true
              });
              confetti({ particleCount: 50, colors: ['#ff2d55'] });
            } else {
              const cleanedDesc = cleanName(data.description);
              setEditingPayment({
                nombre: cleanedDesc,
                pago: data.amount,
                date: data.date || new Date().toISOString()
              });
              setShowAddModal('payment');
              confetti({ particleCount: 50, colors: ['#ff2d55'] });
            }
          } catch (parseErr) {
            console.error("JSON Parse Error:", parseErr);
            if (type === 'quick') {
              setShowPaymentMethodModal(false);
              setShowAddModal('payment');
            }
          }
        } else {
          // No JSON found, fallback to manual
          if (type === 'quick') {
            setShowPaymentMethodModal(false);
            setShowAddModal('payment');
          }
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
    } finally {
      setOcrLoading(false);
    }
  };

  // Routing público (tienda) delegado a main.tsx para extrema velocidad

  if (loading) {
    return (
      <div className="app-container flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-brand animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-container flex flex-col items-center justify-center p-8 text-center min-h-screen">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="mb-12"
        >
          <div className="w-20 h-20 rounded-[24px] bg-brand flex items-center justify-center shadow-[0_12px_30px_rgba(255,45,120,0.3)] mx-auto mb-6">
            <Video className="text-white w-10 h-10" />
          </div>
          <h1 className="text-3xl font-extrabold text-base-text tracking-tight mb-2">Ventas Live</h1>
          <p className="text-sm font-medium text-base-text-muted">Gestiona tus ventas en tiempo real</p>
        </motion.div>
        
        {resetSent ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card-modern p-6 text-center"
          >
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-base-text mb-2">Correo Enviado</h3>
            <p className="text-xs text-base-text-muted mb-6">Revisa tu bandeja de entrada para restablecer tu contraseña.</p>
            <button 
              onClick={() => setResetSent(false)}
              className="btn-pill-primary w-full py-3"
            >
              Volver al Inicio
            </button>
          </motion.div>
        ) : (
          <form onSubmit={handleLogin} className="w-full max-w-xs space-y-4">
            <div className="space-y-3">
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-base-text-muted" />
                <input 
                  type="email" 
                  placeholder="Usuario (Email)" 
                  className="input-modern pl-12"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="relative">
                <Zap className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-base-text-muted" />
                <input 
                  type="password" 
                  placeholder="Contraseña" 
                  className="input-modern pl-12"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>
            
            {loginError && (
              <motion.p 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs font-bold text-brand"
              >
                {loginError}
              </motion.p>
            )}
            
            <button 
              type="submit" 
              className="w-full btn-pill-primary py-4 mt-2"
            >
              {isSignUp ? 'Crear Cuenta' : 'Iniciar Sesión'}
            </button>

            <div className="flex flex-col gap-3 mt-4">
              <button 
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-xs font-bold text-base-text-muted uppercase tracking-widest hover:text-brand transition-colors"
              >
                {isSignUp ? '¿Ya tienes cuenta? Inicia Sesión' : '¿No tienes cuenta? Regístrate'}
              </button>
              
              {!isSignUp && (
                <button 
                  type="button"
                  onClick={handleResetPassword}
                  className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter hover:text-base-text transition-colors"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Content */}
      <main className="flex-1 overflow-y-auto hide-scrollbar p-4 space-y-6 pb-24 pt-4" style={{ background: '#f8f9fa' }}>
        <AnimatePresence mode="wait" initial={false}>
          {currentTab === 'home' && (
            <HomeView
              orders={orders}
              lives={lives}
              transactions={transactions}
              payments={payments}
              pedidos={pedidos}
              key="home"
              onAdd={() => setShowAddModal('order')}
              isInstallable={isInstallable}
              onInstall={handleInstallClick}
            />
          )}
          {currentTab === 'entrega' && <EntregaView pedidos={pedidos} customers={customers} onSelectPerson={(id) => setSelectedPersonId(id)} onRefresh={loadData} key="entrega" />}

          {currentTab === 'payments' && (
            <PaymentsView 
              payments={payments} 
              customers={customers}
              pedidos={pedidos}
              orders={orders}
              key="payments" 
              hideCompletedWork={hideCompletedWork}
              onToggleHideCompleted={() => setHideCompletedWork(!hideCompletedWork)}
              onAdd={() => { setEditingPayment(null); setShowPaymentMethodModal(true); }} 
              onEdit={(p: any) => { setEditingPayment(p); setShowAddModal('payment'); }}
              onLinkNumber={(c: any) => { setLinkingCustomer(c); setShowLinkModal(true); }}
              onSelectPerson={(id: string) => setSelectedPersonId(id)}
              selectedDates={selectedPaymentDates}
              selectedTime={selectedPaymentTime}
              onOpenCalendar={() => setIsPaymentCalendarOpen(true)}
              onResetDate={() => {
                setSelectedPaymentDates([new Date()]);
                setSelectedPaymentTime("");
              }}
              onOpenPeople={() => setShowPeopleModal(true)}
              onReconcile={() => setShowReconciliationModal(true)}
            />
          )}
          {currentTab === 'finance' && (
            <FinanceView 
              transactions={transactions} 
              categories={categories}
              onOcr={handleOcr} 
              ocrLoading={ocrLoading} 
              key="finance" 
              onAdd={() => { setEditingTransaction(null); setShowAddModal('transaction'); }} 
              onEdit={(tx: any) => { setEditingTransaction(tx); setShowAddModal('transaction'); }}
            />
          )}
          {currentTab === 'tienda' && (
            <motion.div key="tienda" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.12 }}>
              <React.Suspense fallback={<div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></div>}>
                <AdminTiendaView userId={user?.id ?? ''} authToken={authToken ?? ''} />
              </React.Suspense>
            </motion.div>
          )}
          {currentTab === 'settings' && <SettingsView payments={payments} onLogout={handleLogout} key="settings" />}
          {currentTab === 'panel_pedidos' && <PanelPedidos />}
        </AnimatePresence>
      </main>

      {/* Bottom Nav */}
      <nav className="glass-nav fixed bottom-0 w-full max-w-[480px] px-2 py-1 flex justify-between items-center z-50 gap-1 overflow-x-auto">
        <TabButton active={currentTab === 'home'} icon={Home} onClick={() => setCurrentTab('home')} />
        <TabButton active={currentTab === 'entrega'} icon={Package} onClick={() => setCurrentTab('entrega')} />
        <TabButton active={currentTab === 'payments'} icon={Wallet} onClick={() => setCurrentTab('payments')} />
        <TabButton active={currentTab === 'finance'} icon={TrendingUp} onClick={() => setCurrentTab('finance')} />
        <TabButton active={currentTab === 'tienda'} icon={Store} onClick={() => setCurrentTab('tienda')} />
        <TabButton active={currentTab === 'settings'} icon={Settings} onClick={() => setCurrentTab('settings')} />
        <TabButton active={currentTab === 'panel_pedidos'} icon={ClipboardList} onClick={() => setCurrentTab('panel_pedidos')} />
      </nav>

      {/* Add Modals */}
      <AnimatePresence>
        {showAddModal === 'order' && <AddOrderModal onClose={() => setShowAddModal(null)} />}
        {showAddModal === 'payment' && (
          <AddPaymentModal
            onClose={() => { setShowAddModal(null); setEditingPayment(null); }}
            editingPayment={editingPayment}
            defaultDate={selectedPaymentDates[0]}
            customers={customers}
            payments={payments}
            onRefresh={loadData}
          />
        )}

        {showPaymentMethodModal && (
          <QuickRegisterModal 
            onClose={() => {
              setShowPaymentMethodModal(false);
              setOcrResult(null);
            }}
            onSelectManual={() => {
              setShowPaymentMethodModal(false);
              setShowAddModal('payment');
            }}
            onSelectOcr={(e: any) => handleOcr(e, 'quick')}
            ocrLoading={ocrLoading}
            ocrResult={ocrResult}
            onGoToProfile={() => {
              if (ocrResult?.customerId) {
                setSelectedPersonId(ocrResult.customerId);
                setShowPeopleModal(true);
                setShowPaymentMethodModal(false);
                setOcrResult(null);
              }
            }}
          />
        )}
        {showReconciliationModal && (
          <ReconciliationModal 
            onClose={() => setShowReconciliationModal(false)}
            selectedDates={selectedPaymentDates}
            payments={payments.filter(p => {
              const pDate = parseAppDate(p.date);
              return pDate && selectedPaymentDates.some(d => d.toDateString() === pDate.toDateString());
            })}
            customers={customers}
            pedidos={pedidos}
            onAddPayment={(amount: number, customerName: string) => {
              setEditingPayment({ nombre: customerName, pago: amount, date: selectedPaymentDates[0].toISOString() });
              setShowAddModal('payment');
              setShowReconciliationModal(false);
            }}
            onSelectPerson={(id: string) => {
              setSelectedPersonId(id);
              setShowReconciliationModal(false);
            }}
          />
        )}
        {selectedPerson && (
          <PersonDetailModal
            person={selectedPerson}
            pedidos={pedidos}
            customers={customers}
            onClose={() => setSelectedPersonId(null)}
            forceDetailView={hideCompletedWork}
            onRefresh={loadData}
            onEditPayment={(p: any) => {
              setEditingPayment(p);
              setShowAddModal('payment');
            }}
            onLinkNumber={(c: any) => {
              setLinkingCustomer(c);
              setShowLinkModal(true);
            }}
          />
        )}
        {showAddModal === 'live' && <AddLiveModal onClose={() => setShowAddModal(null)} />}
        {showLinkModal && (
          <LinkNumberModal 
            customer={linkingCustomer} 
            customers={customers}
            onClose={() => { setShowLinkModal(false); setLinkingCustomer(null); }} 
          />
        )}
        {showAddModal === 'transaction' && (
          <AddTransactionModal 
            onClose={() => { setShowAddModal(null); setEditingTransaction(null); }} 
            editingTransaction={editingTransaction}
            categories={categories}
            onAddCategory={() => setShowAddModal('category')}
          />
        )}
        {showAddModal === 'category' && (
          <AddCategoryModal 
            onClose={() => setShowAddModal('transaction')} 
            categories={categories}
          />
        )}
      </AnimatePresence>

      {isPaymentCalendarOpen && (
        <PaymentCalendarModal 
          selectedDates={selectedPaymentDates}
          selectedTime={selectedPaymentTime}
          onSelect={(dates: Date[], time: string) => {
            setSelectedPaymentDates(dates);
            setSelectedPaymentTime(time);
            setIsPaymentCalendarOpen(false);
          }}
          onClose={() => setIsPaymentCalendarOpen(false)}
          payments={payments}
        />
      )}
    </div>
  );
}

function QuickRegisterModal({ onClose, onSelectManual, onSelectOcr, ocrLoading, ocrResult, onGoToProfile }: any) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'select' | 'processing' | 'success'>('select');

  useEffect(() => {
    if (ocrLoading) {
      setStep('processing');
    } else if (ocrResult) {
      setStep('success');
    }
  }, [ocrLoading, ocrResult]);

  const handleOcrClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="relative w-full max-w-sm bg-white rounded-[32px] p-8 shadow-2xl overflow-hidden"
      >
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="p-2 -ml-2 hover:bg-gray-50 rounded-full transition-colors">
              <ChevronLeft className="w-5 h-5 text-base-text" />
            </button>
            <h3 className="text-lg font-black text-base-text tracking-tight uppercase">REGISTRO TOTAL RÁPIDO</h3>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {step === 'select' && (
            <motion.div 
              key="select"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="space-y-2">
                <p className="text-xs font-bold text-base-text-muted uppercase tracking-widest">Extrae todo (WhatsApp)</p>
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={handleOcrClick}
                    disabled={ocrLoading}
                    className="aspect-square flex flex-col items-center justify-center gap-3 rounded-[32px] bg-pink-50 border-2 border-pink-100 hover:bg-pink-100 transition-all group relative overflow-hidden"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-pink-500 flex items-center justify-center text-white shadow-lg shadow-pink-200 group-hover:scale-110 transition-transform">
                      <Camera className="w-6 h-6" />
                    </div>
                    <div className="text-center px-2">
                      <span className="block text-xs font-black text-pink-600 uppercase tracking-widest">CAPTURA</span>
                      <span className="text-[8px] font-bold text-pink-400 uppercase leading-tight">Extrae todos automáticamente</span>
                    </div>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={onSelectOcr} 
                      className="hidden" 
                      accept="image/*"
                    />
                  </button>

                  <button 
                    onClick={onSelectManual}
                    className="aspect-square flex flex-col items-center justify-center gap-3 rounded-[32px] bg-gray-50 border-2 border-gray-100 hover:bg-gray-100 transition-all group"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-white border border-gray-200 flex items-center justify-center text-gray-400 group-hover:scale-110 transition-transform">
                      <Pencil className="w-6 h-6" />
                    </div>
                    <div className="text-center px-2">
                      <span className="block text-xs font-black text-base-text uppercase tracking-widest">MANUAL</span>
                      <span className="text-[8px] font-bold text-base-text-muted uppercase leading-tight">Ingresa los datos manualmente</span>
                    </div>
                  </button>
                </div>
              </div>

              <div className="space-y-3 bg-gray-50/50 p-6 rounded-[24px]">
                {[
                  'Nombre del cliente?',
                  'Número de WhatsApp',
                  'Monto del pago',
                  'Fecha de pago',
                  'Perfil del cliente'
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                    <span className="text-[11px] font-bold text-base-text-muted uppercase tracking-wider">{item}</span>
                  </div>
                ))}
              </div>

              <div className="text-center">
                <p className="text-[10px] font-bold text-base-text-muted uppercase tracking-widest">
                  Completa <span className="text-pink-500">todo</span> en pocos pasos!
                </p>
                <div className="mt-4 flex justify-center">
                  <div className="w-32 h-10 bg-gray-100 rounded-full flex items-center justify-center gap-2 text-[10px] font-black text-base-text-muted uppercase tracking-widest">
                    Solo revisas y <ChevronRight className="w-3 h-3" />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {step === 'processing' && (
            <motion.div 
              key="processing"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-12 flex flex-col items-center justify-center text-center space-y-6"
            >
              <div className="relative">
                <div className="w-24 h-24 rounded-full border-4 border-pink-100 border-t-pink-500 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Camera className="w-8 h-8 text-pink-500" />
                </div>
              </div>
              <div>
                <h4 className="text-xl font-black text-base-text uppercase tracking-tight">Analizando...</h4>
                <p className="text-xs font-bold text-base-text-muted uppercase tracking-widest mt-2">Gemini está extrayendo los datos</p>
              </div>
            </motion.div>
          )}

          {step === 'success' && (
            <motion.div 
              key="success"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center text-center space-y-8"
            >
              <div className="w-24 h-24 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500 animate-bounce-subtle">
                <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-xl shadow-emerald-200">
                  <Check className="w-10 h-10 stroke-[4]" />
                </div>
              </div>

              <div>
                <h4 className="text-2xl font-black text-base-text uppercase tracking-tight leading-none">¡REGISTRO EXITOSO!</h4>
                <p className="text-xs font-bold text-base-text-muted uppercase tracking-widest mt-3">Todo se registró correctamente</p>
              </div>

              <div className="w-full space-y-3 bg-gray-50/50 p-6 rounded-[24px]">
                {[
                  { label: 'Nombre registrado', done: true },
                  { label: 'Número vinculado', done: true },
                  { label: 'Número registrado', done: true },
                  { label: 'Perfil creado', done: true }
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-[11px] font-bold text-base-text uppercase tracking-wider">{item.label}</span>
                    <Check className="w-3 h-3 text-emerald-500 stroke-[3] ml-auto" />
                  </div>
                ))}
              </div>

              <button 
                onClick={onGoToProfile}
                className="w-full py-4 bg-pink-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-pink-100 active:scale-95 transition-all"
              >
                VER PERFIL
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function PaymentCalendarModal({ selectedDates: initialDates, selectedTime: initialTime, onSelect, onClose, payments }: any) {
  const [viewDate, setViewDate] = useState(new Date(initialDates[0] || new Date()));
  const [selectedDates, setSelectedDates] = useState<Date[]>(initialDates);
  const [selectedTime, setSelectedTime] = useState<string>(initialTime || "");
  
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay();
  
  const getDayStats = (day: number) => {
    const dayPayments = payments.filter((p: any) => {
      const pDate = parseAppDate(p.date);
      if (!pDate) return false;
      return pDate.getDate() === day && 
             pDate.getMonth() === viewDate.getMonth() && 
             pDate.getFullYear() === viewDate.getFullYear();
    });
    return dayPayments.length > 0;
  };

  const toggleDate = (date: Date) => {
    const dateStr = date.toDateString();
    const exists = selectedDates.some(d => d.toDateString() === dateStr);
    if (exists) {
      if (selectedDates.length > 1) {
        setSelectedDates(selectedDates.filter(d => d.toDateString() !== dateStr));
      }
    } else {
      setSelectedDates([...selectedDates, date]);
    }
  };

  const isDateSelected = (day: number) => {
    return selectedDates.some(d => 
      d.getDate() === day && 
      d.getMonth() === viewDate.getMonth() && 
      d.getFullYear() === viewDate.getFullYear()
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="relative w-full max-w-sm bg-white rounded-[32px] p-6 shadow-2xl overflow-hidden"
      >
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-extrabold text-base-text tracking-tight">Seleccionar Fecha</h3>
            <p className="text-[10px] font-bold text-base-text-muted uppercase tracking-widest mt-0.5">Puedes elegir varios días</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-base-text-muted" />
          </button>
        </div>

        <div className="space-y-6">
          <div className="flex justify-between items-center bg-gray-50 p-3 rounded-2xl">
            <button onClick={() => setViewDate(new Date(viewDate.setMonth(viewDate.getMonth() - 1)))}>
              <ChevronLeft className="w-5 h-5 text-base-text-muted" />
            </button>
            <span className="text-xs font-bold text-base-text uppercase tracking-widest">
              {viewDate.toLocaleString('es', { month: 'long', year: 'numeric' })}
            </span>
            <button onClick={() => setViewDate(new Date(viewDate.setMonth(viewDate.getMonth() + 1)))}>
              <ChevronRight className="w-5 h-5 text-base-text-muted" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d, i) => (
              <span key={`${d}-${i}`} className="text-[10px] font-bold text-base-text-muted mb-2">{d}</span>
            ))}
            {Array.from({ length: firstDayOfMonth }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const hasPayments = getDayStats(day);
              const isSelected = isDateSelected(day);
              const isToday = day === new Date().getDate() && 
                             viewDate.getMonth() === new Date().getMonth() && 
                             viewDate.getFullYear() === new Date().getFullYear();
              
              return (
                <button 
                  key={day} 
                  onClick={() => toggleDate(new Date(viewDate.getFullYear(), viewDate.getMonth(), day))}
                  className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all ${isSelected ? 'bg-brand text-white shadow-lg shadow-brand/20' : isToday ? 'bg-brand/5 border border-brand/20' : 'hover:bg-gray-50'}`}
                >
                  <span className={`text-[11px] font-bold ${isSelected ? 'text-white' : isToday ? 'text-brand' : 'text-base-text'}`}>{day}</span>
                  {hasPayments && (
                    <div className={`w-1 h-1 rounded-full mt-0.5 ${isSelected ? 'bg-white' : 'bg-brand'}`} />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[9px] font-bold text-base-text-muted uppercase tracking-widest ml-1 mb-1 block">Filtrar por Hora</label>
              <input 
                type="time" 
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                className="w-full p-3 bg-gray-50 rounded-2xl text-xs font-bold text-base-text outline-none focus:bg-gray-100 transition-all"
              />
            </div>
            <div className="flex-1 flex items-end">
              <button 
                onClick={() => setSelectedDates([new Date()])}
                className="w-full py-3 bg-gray-50 hover:bg-gray-100 rounded-2xl text-[11px] font-bold text-base-text uppercase tracking-widest transition-colors"
              >
                Hoy
              </button>
            </div>
          </div>

          <button 
            onClick={() => onSelect(selectedDates, selectedTime)}
            className="w-full py-4 bg-brand text-white rounded-2xl text-xs font-bold uppercase tracking-widest shadow-lg shadow-brand/20 active:scale-95 transition-all"
          >
            Aplicar Selección ({selectedDates.length})
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// --- Views ---

function HomeView({ orders, lives, transactions, payments, pedidos, onAdd, isInstallable, onInstall }: any) {
  const today = new Date();
  const todayStr = today.toDateString();

  // Métricas de pagos
  const pagosHoy = (payments ?? []).filter((p: any) => new Date(p.date || p.fecha).toDateString() === todayStr);
  const ingresosHoy = pagosHoy.reduce((acc: number, p: any) => acc + (cleanAmount(p.pago) || 0), 0);
  const totalIngresos = (payments ?? []).reduce((acc: number, p: any) => acc + (cleanAmount(p.pago) || 0), 0);

  // Métricas de pedidos
  const pedidosProcesar = (pedidos ?? []).filter((p: any) => (p.status ?? '').toLowerCase() === 'procesar').length;
  const pedidosListos   = (pedidos ?? []).filter((p: any) => (p.status ?? '').toLowerCase() === 'listo').length;
  const pedidosTotal    = (pedidos ?? []).length;

  // Próximo live
  const nextLive = (lives ?? []).find((l: any) => l.status === 'scheduled');

  // Ingresos del mes desde transacciones
  const thisMonth = today.getMonth();
  const thisYear  = today.getFullYear();
  const ingresosMes = (transactions ?? [])
    .filter((t: any) => t.type === 'income' && new Date(t.fecha || t.date).getMonth() === thisMonth && new Date(t.fecha || t.date).getFullYear() === thisYear)
    .reduce((acc: number, t: any) => acc + (t.amount || 0), 0);

  // Pagos recientes
  const pagosRecientes = [...(payments ?? [])].sort((a: any, b: any) => new Date(b.date || b.fecha).getTime() - new Date(a.date || a.fecha).getTime()).slice(0, 5);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="space-y-5 -mx-4 -mt-4 px-4 pt-4 pb-4"
      style={{ background: 'linear-gradient(180deg, #fff0f5 0%, #f8f9fa 140px)' }}
    >
      {/* PWA Banner */}
      {isInstallable && (
        <div className="flex items-center justify-between bg-white/80 backdrop-blur rounded-2xl px-4 py-3 border border-brand/10 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand flex items-center justify-center">
              <Rocket className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-[13px] font-bold text-gray-900">Instalar app</p>
              <p className="text-[10px] text-gray-400">Sin barra de navegador</p>
            </div>
          </div>
          <button onClick={onInstall} className="btn-pill-primary py-1.5 px-3 text-xs">Instalar</button>
        </div>
      )}

      {/* Hero card: Ingresos hoy */}
      <div className="rounded-[24px] p-5 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #ff2d78 0%, #ff6fa3 100%)', boxShadow: '0 16px 40px rgba(255,45,120,0.28)' }}>
        <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/10" />
        <div className="absolute -right-2 bottom-0 w-16 h-16 rounded-full bg-white/5" />
        <p className="text-[11px] font-black uppercase tracking-widest opacity-80 mb-1">Ingresos hoy</p>
        <h2 className="text-4xl font-black leading-none mb-3">Bs {ingresosHoy.toLocaleString('es-BO', { minimumFractionDigits: 0 })}</h2>
        <div className="flex items-center gap-4">
          <div>
            <p className="text-[10px] opacity-70 font-bold uppercase tracking-wide">Pagos hoy</p>
            <p className="text-xl font-black">{pagosHoy.length}</p>
          </div>
          <div className="w-px h-8 bg-white/20" />
          <div>
            <p className="text-[10px] opacity-70 font-bold uppercase tracking-wide">Total acumulado</p>
            <p className="text-xl font-black">Bs {totalIngresos.toLocaleString('es-BO', { minimumFractionDigits: 0 })}</p>
          </div>
          <div className="w-px h-8 bg-white/20" />
          <div>
            <p className="text-[10px] opacity-70 font-bold uppercase tracking-wide">Mes</p>
            <p className="text-xl font-black">Bs {ingresosMes.toLocaleString('es-BO', { minimumFractionDigits: 0 })}</p>
          </div>
        </div>
      </div>

      {/* Stats grid: pedidos */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-3.5 text-center" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <p className="text-2xl font-black text-amber-500">{pedidosProcesar}</p>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mt-0.5">Procesar</p>
        </div>
        <div className="bg-white rounded-2xl p-3.5 text-center" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <p className="text-2xl font-black text-blue-500">{pedidosListos}</p>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mt-0.5">Listos</p>
        </div>
        <div className="bg-white rounded-2xl p-3.5 text-center" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <p className="text-2xl font-black text-gray-700">{pedidosTotal}</p>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mt-0.5">Total</p>
        </div>
      </div>

      {/* Próximo live */}
      {nextLive && (
        <div className="bg-white rounded-2xl p-4 flex items-center gap-3" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#fff0f5' }}>
            <Video className="w-5 h-5" style={{ color: '#ff2d78' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#ff2d78' }}>Próximo Live</p>
            <p className="font-black text-[14px] text-gray-900 truncate">{nextLive.title}</p>
            <p className="text-[11px] text-gray-400 font-medium">{formatAppDate(nextLive.scheduledAt)}</p>
          </div>
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#ff2d78' }} />
        </div>
      )}

      {/* Pagos recientes */}
      <div className="space-y-2.5">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.18em] px-1">Pagos recientes</p>
        {pagosRecientes.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <p className="text-[13px] font-bold text-gray-300">Sin pagos registrados</p>
          </div>
        ) : (
          pagosRecientes.map((p: any, i: number) => (
            <div key={p.id ?? i} className="bg-white rounded-2xl px-4 py-3 flex items-center gap-3" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 font-black text-[13px] text-white" style={{ background: 'linear-gradient(135deg,#ff2d78,#ff6fa3)' }}>
                {(p.nombre ?? '?')[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-[13px] text-gray-900 truncate">{p.nombre}</p>
                <p className="text-[10px] text-gray-400 font-medium">{new Date(p.date || p.fecha).toLocaleDateString('es-BO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
              </div>
              <p className="font-black text-[15px]" style={{ color: '#ff2d78' }}>Bs {cleanAmount(p.pago)}</p>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTREGA VIEW — visualización del sistema de casilleros
// ─────────────────────────────────────────────────────────────────────────────
function EntregaView({ pedidos, customers, onSelectPerson, onRefresh }: { pedidos: any[]; customers: any[]; onSelectPerson: (id: string) => void; onRefresh: () => void }) {
  const [selectedPedido, setSelectedPedido] = useState<any>(null);
  const [isDelivering, setIsDelivering] = useState(false);

  const activos = pedidos.filter(p => {
    const s = (p.status ?? '').toLowerCase();
    return s === 'listo' || s === 'preparado' || s === 'ready';
  });

  const NUMERIC = ['1', '2', '3', '4'];
  const ALPHA   = ['A', 'B', 'C', 'D'];
  const MAX_SIMPLE = 4;

  const byLabel = (code: string) => activos.filter(p => p.label === code);
  const alphaOccupant = (code: string) => activos.find(p => p.label === code) ?? null;

  const abrev = (name: string) => {
    const parts = (name ?? '').trim().split(' ');
    if (parts.length === 1) return parts[0].slice(0, 10);
    return parts[0] + ' ' + parts[1][0] + '.';
  };

  const handleDeliver = async () => {
    if (!selectedPedido || isDelivering) return;
    setIsDelivering(true);
    try {
      await pedidosApi.update(selectedPedido.id, { status: 'entregado' });
      const updatedPedidos = pedidos.map((p: any) =>
        p.id === selectedPedido.id ? { ...p, status: 'entregado' } : p
      );
      if (selectedPedido.customerId) {
        await syncLabelsForCustomer(selectedPedido.customerId, updatedPedidos, customers);
      }
      setSelectedPedido(null);
      onRefresh();
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 }, colors: ['#2E7D32', '#E8F5E9', '#10B981'] });
    } catch (e) {
      console.error('Error al entregar:', e);
      alert('Error al marcar como entregado');
    } finally {
      setIsDelivering(false);
    }
  };

  return (
    <motion.div
      key="entrega"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.12 }}
      className="space-y-6 pb-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-2xl font-extrabold text-base-text tracking-tight">Entrega</h2>
          <p className="text-[11px] text-gray-400 font-medium mt-0.5">
            {activos.length} pedido{activos.length !== 1 ? 's' : ''} activo{activos.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-1.5">
          <div className="flex items-center gap-1 bg-gray-100 rounded-full px-2.5 py-1">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-[10px] font-bold text-gray-500">1 bolsa</span>
          </div>
          <div className="flex items-center gap-1 bg-gray-100 rounded-full px-2.5 py-1">
            <div className="w-2 h-2 rounded-full bg-brand" />
            <span className="text-[10px] font-bold text-gray-500">2+ bolsas</span>
          </div>
        </div>
      </div>

      {/* ── NUMÉRICOS activos ── */}
      {NUMERIC.some(code => byLabel(code).length > 0) && (
        <section className="space-y-2">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.18em] px-1">
            Numéricos — 1 bolsa
          </p>
          <div className="grid grid-cols-2 gap-2">
            {NUMERIC.filter(code => byLabel(code).length > 0).map(code => {
              const occupants = byLabel(code);
              return (
                <div key={code} className="rounded-2xl p-3 border-2 bg-blue-50/50 border-blue-100 transition-all">
                  <p className="text-[9px] font-black text-blue-300 uppercase tracking-widest mb-1.5 px-0.5">Casillero {code}</p>
                  <div className="space-y-1">
                    {occupants.map((p: any, i: number) => (
                      <button
                        key={p.id ?? i}
                        onClick={() => setSelectedPedido(p)}
                        className="w-full rounded-xl px-2.5 py-2 text-left bg-blue-500 text-white active:scale-95 transition-all"
                      >
                        <span className="text-[11px] font-bold block leading-tight">{p.customerName}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── ALFABÉTICOS activos ── */}
      {ALPHA.some(code => alphaOccupant(code)) && (
        <section className="space-y-2">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.18em] px-1">
            Alfabéticos — 2+ bolsas
          </p>
          <div className="space-y-2">
            {ALPHA.filter(code => alphaOccupant(code)).map(code => {
              const occupant = alphaOccupant(code)!;
              return (
                <button
                  key={code}
                  onClick={() => setSelectedPedido(occupant)}
                  className="w-full rounded-2xl px-4 py-3 border-2 flex items-center gap-3 transition-all text-left bg-[#FFF0F5] border-brand/20 active:scale-[0.98]"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-black text-brand/40 uppercase tracking-widest mb-0.5">Casillero {code}</p>
                    <p className="font-black text-[14px] text-gray-900 leading-tight">{occupant.customerName}</p>
                    <p className="text-[11px] font-bold text-brand mt-0.5">
                      {occupant.bagCount} bolsa{occupant.bagCount !== 1 ? 's' : ''} · {occupant.itemCount ?? 0} prendas
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Estado vacío */}
      {activos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <Package className="w-8 h-8 text-gray-300" />
          </div>
          <p className="text-[13px] font-bold text-gray-400">Sin pedidos en casilleros</p>
          <p className="text-[11px] text-gray-300 mt-1">Los casilleros aparecerán cuando haya pedidos listos</p>
        </div>
      )}

      {/* Modal detalle del pedido */}
      {selectedPedido && (
        <div
          className="fixed inset-0 z-[200] bg-black/40 flex items-end"
          onClick={() => setSelectedPedido(null)}
        >
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-[480px] mx-auto bg-white rounded-t-[28px] p-6 pb-10"
          >
            {/* Handle */}
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

            {/* Etiqueta grande */}
            <div className="flex items-center gap-4 mb-5">
              <div className={cn(
                'w-16 h-16 rounded-2xl flex items-center justify-center',
                selectedPedido.labelType === 'letter' ? 'bg-brand' : 'bg-blue-500'
              )}>
                <span className="text-3xl font-black text-white">{selectedPedido.label}</span>
              </div>
              <div>
                <p className="font-black text-xl text-gray-900">{selectedPedido.customerName}</p>
                <p className="text-[12px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                  Casillero {selectedPedido.labelType === 'letter' ? 'exclusivo' : 'compartido'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-2xl p-3 text-center">
                <p className="text-2xl font-black text-gray-800">{selectedPedido.bagCount}</p>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Bolsas</p>
              </div>
              <div className="bg-gray-50 rounded-2xl p-3 text-center">
                <p className="text-2xl font-black text-gray-800">{selectedPedido.itemCount ?? 0}</p>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Prendas</p>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              {selectedPedido.customerId && (
                <button
                  onClick={() => { setSelectedPedido(null); onSelectPerson(selectedPedido.customerId); }}
                  className="w-full py-3 rounded-2xl font-black text-sm"
                  style={{ background: '#fff0f5', color: '#ff2d78' }}
                >
                  Ver perfil
                </button>
              )}
              <button
                onClick={handleDeliver}
                disabled={isDelivering}
                className="w-full py-3 rounded-2xl font-black text-sm text-white disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
              >
                {isDelivering ? 'Entregando...' : '✓ Marcar como entregado'}
              </button>
              <button
                onClick={() => setSelectedPedido(null)}
                className="w-full py-3 rounded-2xl bg-gray-100 text-gray-600 font-black text-sm"
              >
                Cerrar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}

function CalendarView({ lives, onAdd }: any) {
  return (
    <motion.div 
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.1, ease: "linear" }}
      className="space-y-6"
    >
      <div className="flex justify-between items-center px-1">
        <h2 className="text-2xl font-extrabold text-base-text tracking-tight">Calendario</h2>
        <button onClick={onAdd} className="btn-tertiary-brand text-xs">
          <Plus className="w-4 h-4" />
          Programar
        </button>
      </div>

      <div className="space-y-2">
        {lives.map((live: any, idx: number) => {
          const date = parseAppDate(live.scheduledAt) || new Date();
          const day = date.getDate();
          const month = date.toLocaleString('es', { month: 'short' }).toUpperCase();
          
          return (
            <div key={`${live.id || idx}-${idx}`} className="card-modern py-3 flex items-center gap-4 hover:scale-[1.01] active:scale-100 cursor-pointer">
              <div className="w-11 h-11 rounded-2xl bg-brand/5 flex flex-col items-center justify-center text-brand">
                <span className="text-[9px] font-extrabold uppercase tracking-tighter">{month}</span>
                <span className="text-lg font-extrabold leading-none">{day}</span>
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-base-text">{live.title}</h4>
                <div className="flex items-center gap-2 mt-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${live.status === 'scheduled' ? 'bg-blue-400' : 'bg-brand'}`} />
                  <p className="text-[11px] text-base-text-muted font-semibold uppercase tracking-wider">
                    {live.status === 'scheduled' ? 'Programado' : 'En Vivo'}
                  </p>
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center">
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

function LinkNumberModal({ customer: initialCustomer, customers, onClose }: { customer: any, customers: any[], onClose: () => void }) {
  const [selectedCustomer, setSelectedCustomer] = useState(initialCustomer);
  const [searchTerm, setSearchTerm] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState<{ phone: string, name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isManual, setIsManual] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredCustomers = useMemo(() => {
    if (!searchTerm) return [];
    return customers.filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 5);
  }, [customers, searchTerm]);

  const handleManualConfirm = async () => {
    if (!phone || !selectedCustomer) return;
    setLoading(true);
    try {
      let customerId = selectedCustomer.id;
      if (!customerId) {
        const q = query(collection(db, 'customers'), where('name', '==', selectedCustomer.name));
        const snap = await getDocs(q);
        if (!snap.empty) {
          customerId = snap.docs[0].id;
        } else {
          const newDoc = await addDoc(collection(db, 'customers'), {
            name: selectedCustomer.name,
            phone: phone,
            createdAt: new Date().toISOString()
          });
          customerId = newDoc.id;
        }
      }

      if (customerId) {
        await updateDoc(doc(db, 'customers', customerId), { phone });
      }
      onClose();
    } catch (err) {
      console.error(err);
      setError('Error al guardar el número');
    } finally {
      setLoading(false);
    }
  };

  const handleOcr = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCustomer) return;

    setLoading(true);
    setError(null);
    setOcrResult(null);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [
            {
              inlineData: {
                data: base64,
                mimeType: file.type
              }
            },
            {
              text: "Extract the phone number from the header of this WhatsApp screenshot and the name of the sender/comprobante (look for 'Cuenta origen', QR name, or sender name). Return JSON format: { \"phone\": \"...\", \"name\": \"...\" }"
            }
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                phone: { type: Type.STRING },
                name: { type: Type.STRING }
              },
              required: ["phone", "name"]
            }
          }
        });

        const data = JSON.parse(response.text || '{}');
        const extractedName = data.name || '';
        const extractedPhone = data.phone?.replace(/\D/g, '') || '';

        const normalizedCustomer = normalizeName(selectedCustomer.name);
        const normalizedExtracted = normalizeName(extractedName);

        if (normalizedCustomer === normalizedExtracted) {
          setOcrResult({ phone: extractedPhone, name: extractedName });
          setPhone(extractedPhone);
        } else {
          setError(`No se puede vincular el número. El nombre del comprobante no coincide con el cliente seleccionado.\n\nCliente esperado: ${selectedCustomer.name}\nNombre detectado: ${extractedName}`);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setError('Error al procesar la imagen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xl font-extrabold text-base-text tracking-tight">Vincular número</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-base-text-muted" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {!selectedCustomer ? (
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-base-text-muted uppercase tracking-wider block mb-2">Seleccionar Cliente</label>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input 
                    type="text"
                    placeholder="Buscar por nombre..."
                    className="input-modern pl-11"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>
              
              {filteredCustomers.length > 0 && (
                <div className="space-y-2">
                  {filteredCustomers.map((c, idx) => (
                    <button 
                      key={`${c.id || 'cust'}-${idx}`}
                      onClick={() => setSelectedCustomer(c)}
                      className="w-full p-4 text-left bg-gray-50 hover:bg-brand/5 rounded-2xl border border-gray-100 transition-colors group"
                    >
                      <span className="font-bold text-base-text group-hover:text-brand uppercase tracking-tight">{c.name}</span>
                      {c.phone && <span className="block text-[10px] text-base-text-muted font-bold">{c.phone}</span>}
                    </button>
                  ))}
                </div>
              )}

              {searchTerm && filteredCustomers.length === 0 && (
                <button 
                  onClick={() => setSelectedCustomer({ name: searchTerm })}
                  className="w-full p-4 text-left bg-brand/5 border border-brand/10 rounded-2xl flex items-center justify-between group"
                >
                  <span className="font-bold text-brand uppercase tracking-tight">Crear "{searchTerm}"</span>
                  <Plus className="w-4 h-4 text-brand" />
                </button>
              )}
            </div>
          ) : (
            <>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[10px] font-bold text-base-text-muted uppercase tracking-wider">Cliente</label>
                  {!initialCustomer && (
                    <button onClick={() => setSelectedCustomer(null)} className="text-[10px] font-bold text-brand uppercase tracking-wider">Cambiar</button>
                  )}
                </div>
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 font-bold text-base-text uppercase tracking-tight">
                  {selectedCustomer.name}
                </div>
              </div>

              {!isManual && !ocrResult && !error && (
                <div className="space-y-3">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                    className="w-full btn-pill-primary py-4 flex items-center justify-center gap-3"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
                    Vincular desde captura
                  </button>
                  <button 
                    onClick={() => setIsManual(true)}
                    className="w-full py-4 text-sm font-bold text-base-text-muted hover:text-brand transition-colors uppercase tracking-widest"
                  >
                    Ingresar manual
                  </button>
                </div>
              )}

              {isManual && (
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-base-text-muted uppercase tracking-wider block mb-2">Número de WhatsApp</label>
                    <input 
                      type="tel"
                      placeholder="Ej: 78945612"
                      className="input-modern"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setIsManual(false)} className="flex-1 py-4 text-sm font-bold text-base-text-muted uppercase tracking-widest">Atrás</button>
                    <button onClick={handleManualConfirm} disabled={loading || !phone} className="flex-1 btn-pill-primary py-4">
                      {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Confirmar'}
                    </button>
                  </div>
                </div>
              )}

              {ocrResult && (
                <div className="space-y-4">
                  <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-2">
                    <div className="flex items-center gap-2 text-emerald-600 font-bold text-xs uppercase tracking-wider">
                      <CheckCircle2 className="w-4 h-4" />
                      Coincidencia válida
                    </div>
                    <div className="text-[10px] font-bold text-emerald-800/60 uppercase tracking-tight">
                      Nombre detectado: {ocrResult.name}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-base-text-muted uppercase tracking-wider block mb-2">Número detectado</label>
                    <input 
                      type="tel"
                      className="input-modern"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                  <button onClick={handleManualConfirm} disabled={loading} className="w-full btn-pill-primary py-4">
                    {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Confirmar vinculación'}
                  </button>
                  <button onClick={() => setOcrResult(null)} className="w-full py-2 text-[10px] font-bold text-base-text-muted uppercase tracking-widest">Subir otra captura</button>
                </div>
              )}

              {error && (
                <div className="space-y-4">
                  <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100 space-y-3">
                    <div className="flex items-center gap-2 text-rose-600 font-bold text-xs uppercase tracking-wider">
                      <AlertCircle className="w-4 h-4" />
                      Error de validación
                    </div>
                    <p className="text-[11px] font-bold text-rose-800 leading-relaxed whitespace-pre-wrap">
                      {error}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <button onClick={() => fileInputRef.current?.click()} className="w-full btn-pill-primary py-4">Subir otra captura</button>
                    <button onClick={() => { setError(null); setIsManual(true); }} className="w-full py-4 text-sm font-bold text-base-text-muted uppercase tracking-widest">Ingresar manual</button>
                  </div>
                </div>
              )}
            </>
          )}

          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={handleOcr} 
          />
        </div>
      </motion.div>
    </div>
  );
}

function ConfirmModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = "Eliminar", 
  cancelText = "Cancelar",
  isDanger = true 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onConfirm: () => void, 
  title: string, 
  message: string, 
  confirmText?: string, 
  cancelText?: string,
  isDanger?: boolean
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white w-full max-w-[320px] rounded-[24px] p-6 shadow-2xl text-center"
      >
        <div className={cn(
          "w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4",
          isDanger ? "bg-rose-50 text-rose-500" : "bg-blue-50 text-blue-500"
        )}>
          {isDanger ? <Trash2 size={24} /> : <AlertCircle size={24} />}
        </div>
        <h3 className="text-lg font-bold text-base-text mb-2">{title}</h3>
        <p className="text-xs text-base-text-muted mb-6">{message}</p>
        <div className="flex flex-col gap-2">
          <button 
            onClick={() => { onConfirm(); onClose(); }}
            className={cn(
              "w-full py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-95",
              isDanger ? "bg-rose-500 text-white shadow-lg shadow-rose-100" : "bg-brand text-white shadow-lg shadow-brand/20"
            )}
          >
            {confirmText}
          </button>
          <button 
            onClick={onClose}
            className="w-full py-3 rounded-xl text-xs font-black text-base-text-muted uppercase tracking-widest hover:bg-gray-50 transition-all"
          >
            {cancelText}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function PaymentsView({ 
  payments, 
  customers, 
  onAdd, 
  onEdit, 
  onLinkNumber, 
  onSelectPerson: onSelectPersonProp, 
  selectedDates, 
  selectedTime,
  onOpenCalendar, 
  onResetDate, 
  onOpenPeople,
  onReconcile,
  onToggleHideCompleted,
  pedidos,
  hideCompletedWork,
  orders = []
}: { 
  payments: Payment[], 
  customers: Customer[], 
  pedidos: Pedido[],
  orders?: any[],
  onAdd: () => void, 
  onEdit: (p: any) => void, 
  onLinkNumber: (c: any) => void, 
  onSelectPerson: (name: string) => void, 
  selectedDates: Date[], 
  selectedTime: string,
  onOpenCalendar: () => void, 
  onResetDate: () => void, 
  onOpenPeople: () => void,
  onReconcile: () => void,
  onToggleHideCompleted: () => void,
  hideCompletedWork: boolean,
  key?: string 
}) {
  const cleanText = (val: string | undefined) => {
    if (!val) return '';
    return val.replace(/^[^a-zA-Z0-9Á-ÿ]+/, '').trim();
  };

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showOnlyWithPhone, setShowOnlyWithPhone] = useState(false);

  const onSelectPerson = (id: string) => {
    onSelectPersonProp(id);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(id);
  };

  const executeDelete = async () => {
    if (!confirmDelete) return;
    const paymentToDelete = payments.find(p => p.id === confirmDelete);
    
    try {
      await deleteDoc(doc(db, 'pagos', confirmDelete));
      
      // If we have the payment data, check if it was the last one
      if (paymentToDelete) {
        const cleanedName = cleanName(paymentToDelete.nombre);
        const remainingPayments = payments.filter(p => 
          p.id !== confirmDelete && 
          (p.customerId === paymentToDelete.customerId || cleanName(p.nombre) === cleanedName)
        );

        if (remainingPayments.length === 0) {
          // It was the last payment! Clean up everything immediately
          const batch = writeBatch(db);
          
          // 1. Delete customer doc
          if (paymentToDelete.customerId) {
            batch.delete(doc(db, 'customers', paymentToDelete.customerId));
          } else {
            const q = query(collection(db, 'customers'), where('name', '==', cleanedName));
            const snap = await getDocs(q);
            snap.docs.forEach(d => batch.delete(d.ref));
          }

          // 2. Delete pedidos and orders (we'll let the background cleanup handle this if we can't find them here,
          // but let's try to find them by customerId/name if possible)
          // Actually, the background cleanup I added is already watching 'payments' and 'people'
          // and it will trigger because 'payments' just changed.
          // But let's make it faster by reducing the grace period in the effect.
        }
      }
    } catch (error) {
      console.error("Error deleting payment:", error);
    } finally {
      setConfirmDelete(null);
    }
  };

  const isToday = selectedDates.length === 1 && selectedDates[0].toDateString() === new Date().toDateString();
  const dateLabel = selectedDates.length > 1 
    ? `TOTAL - ${selectedDates.length} DÍAS`
    : isToday ? 'TOTAL HOY' : `TOTAL - ${selectedDates[0].toLocaleDateString('es', { day: '2-digit', month: 'short' }).toUpperCase()}`;

  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      const pDate = parseAppDate(p.date);
      if (!pDate) return false;
      
      const matchesDate = selectedDates.some(d => d.toDateString() === pDate.toDateString());
      if (!matchesDate) return false;

      if (selectedTime) {
        const [h, m] = selectedTime.split(':').map(Number);
        const pTime = pDate.getHours() * 60 + pDate.getMinutes();
        const sTime = h * 60 + m;
        return pTime >= sTime; // Show payments from that time onwards
      }

      return true;
    });
  }, [payments, selectedDates, selectedTime]);

  const stats = useMemo(() => {
    const totalSelected = filteredPayments.reduce((acc, p) => acc + cleanAmount(p.pago), 0);
    const uniquePeople = new Set(filteredPayments.map(p => cleanName(p.nombre).toLowerCase())).size;

    return {
      totalSelected,
      count: filteredPayments.length,
      people: uniquePeople
    };
  }, [filteredPayments]);

  const groupedPayments = useMemo(() => {
    const groups: { [key: string]: any } = {};
    
    // Ordenamos por fecha descendente antes de agrupar
    const sortedPayments = [...filteredPayments].sort((a, b) => getTS(b.date) - getTS(a.date));

    sortedPayments.forEach(p => {
      const rawName = p.nombre || 'Desconocido';
      const cleanedName = cleanName(rawName);
      
      // Find customer info robustly (normalizing names for old records)
      const customer = customers.find(c => (p.customerId && c.id === p.customerId) || cleanName(c.name) === cleanedName);
      
      const groupKey = customer ? customer.id : cleanedName;
      
      const amount = cleanAmount(p.pago);
      const ts = getTS(p.date);

      if (!groups[groupKey]) {
        groups[groupKey] = {
          id: groupKey,
          nombre: customer ? customer.name : getVisualName(rawName),
          totalAmount: 0,
          lastAmount: amount,
          lastTimestamp: ts,
          phone: customer?.phone || '',
          customerId: customer?.id || null,
          history: []
        };
      }
      groups[groupKey].totalAmount += amount;
      groups[groupKey].history.push({ ...p, pago: amount });
    });

    let result = Object.values(groups);

    if (showOnlyWithPhone) {
      result = result.filter((group: any) => group.phone && group.phone.length > 0);
    }

    if (hideCompletedWork) {
      result = result.filter((group: any) => {
        const cleanedGroupName = cleanName(group.nombre);
        
        // Find all work (pedidos and legacy orders) for this customer
        const customerPedidos = pedidos.filter(p => 
          (group.customerId && p.customerId === group.customerId) || 
          (p.customerName && cleanName(p.customerName) === cleanedGroupName)
        );

        const customerOrders = orders.filter(o => 
          (group.customerId && o.customerId === group.customerId) || 
          (o.customerName && cleanName(o.customerName) === cleanedGroupName)
        );

        const allWork = [...customerPedidos, ...customerOrders];

        // If they have no work records, keep them visible (they just paid)
        if (allWork.length === 0) return true;

        // Check if they have any order that is NOT 'Listo' or 'Entregado'
        const hasPending = allWork.some(p => {
          const s = (p.status || '').toUpperCase();
          return s === 'PROCESAR' || s === 'VERIFICADO' || s === 'PENDING';
        });

        // If they have at least one pending order, stay visible
        if (hasPending) return true;

        // If all orders are 'Listo' (or 'Entregado'), hide them
        return false;
      });
    }

    return result.sort((a: any, b: any) => b.lastTimestamp - a.lastTimestamp);
  }, [filteredPayments, customers, pedidos, hideCompletedWork]);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.1, ease: "linear" }}
      className="space-y-6"
    >
      <div className="flex justify-between items-center px-1">
        <div className="flex-1">
          <p className="text-[10px] font-black text-brand tracking-widest uppercase mb-1">
            VISTA DE PAGOS
          </p>
          <h2 className="text-2xl font-extrabold text-base-text tracking-tight uppercase">Pagos</h2>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={onReconcile} 
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 text-gray-400 hover:bg-gray-200 transition-all active:scale-90"
            title="Conciliar"
          >
            <FileCheck size={18} />
          </button>
          <button 
            onClick={() => setShowOnlyWithPhone(!showOnlyWithPhone)} 
            className={cn(
              "w-9 h-9 flex items-center justify-center rounded-xl transition-all active:scale-90",
              showOnlyWithPhone 
                ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" 
                : "bg-gray-100 text-gray-400 hover:bg-gray-200"
            )}
            title={showOnlyWithPhone ? "Mostrando solo con WhatsApp" : "Filtrar por WhatsApp"}
          >
            <Hash size={18} />
          </button>
          <button 
            onClick={onToggleHideCompleted} 
            className={cn(
              "w-9 h-9 flex items-center justify-center rounded-xl transition-all active:scale-90",
              hideCompletedWork 
                ? "bg-brand text-white shadow-lg shadow-brand/20" 
                : "bg-gray-100 text-gray-400 hover:bg-gray-200"
            )}
            title={hideCompletedWork ? "Mostrando solo pendientes" : "Filtrar completados"}
          >
            {hideCompletedWork ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
          <button onClick={onAdd} className="btn-tertiary-brand text-xs">
            <Plus className="w-4 h-4" />
            Registrar
          </button>
        </div>
      </div>

      {/* Stats Panel */}
      <div className="grid grid-cols-3 gap-2">
        <button 
          onClick={onOpenCalendar}
          className={`card-modern p-3 flex flex-col items-center justify-center text-center transition-all hover:scale-[1.02] active:scale-[0.98] ${isToday ? '' : 'bg-brand/5 border-brand/20'}`}
        >
          <span className={`text-[9px] font-bold uppercase tracking-wider mb-1 ${isToday ? 'text-base-text-muted' : 'text-brand'}`}>{dateLabel}</span>
          <span className={`text-xl font-extrabold leading-none ${isToday ? 'text-base-text' : 'text-brand'}`}>Bs {stats.totalSelected}</span>
        </button>
        
        <div className="card-modern p-3 flex flex-col items-center justify-center text-center">
          <span className="text-[9px] font-bold text-base-text-muted uppercase tracking-wider mb-1">Pagos</span>
          <span className="text-xl font-extrabold text-base-text leading-none">{stats.count}</span>
        </div>

        <button 
          onClick={onOpenPeople}
          className="card-modern p-3 flex flex-col items-center justify-center text-center transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <span className="text-[9px] font-bold text-base-text-muted uppercase tracking-wider mb-1">
            {stats.people === 1 ? 'Persona' : 'Personas'}
          </span>
          <span className="text-xl font-extrabold text-base-text leading-none">{stats.people}</span>
        </button>
      </div>

      <div className="space-y-3">
        {groupedPayments.length === 0 ? (
          <div className="text-center py-24 opacity-20">
            <Wallet className="w-16 h-16 mx-auto mb-4" />
            <p className="text-sm font-bold uppercase tracking-[0.2em]">
              Sin pagos para esta fecha
            </p>
          </div>
        ) : (
          groupedPayments.map((group: any, groupIdx: number) => (
            <div key={`${group.nombre}-${groupIdx}`} className="card-modern p-0 overflow-hidden">
              {/* Header Card */}
              <div 
                onClick={() => {
                  if (showOnlyWithPhone && group.phone) {
                    window.open(`https://wa.me/${group.phone.replace(/\D/g, '')}`, '_blank');
                  } else {
                    onSelectPerson(group.id);
                  }
                }}
                className="w-full pl-2 pr-4 py-4 flex items-center justify-between active:bg-gray-50 transition-colors gap-2 cursor-pointer"
              >
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <div className="flex-shrink-0 w-7 h-7 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col items-start min-w-0">
                    <span className="font-bold text-base-text text-sm text-left leading-tight uppercase tracking-tight truncate w-full">
                      {showOnlyWithPhone ? group.phone.replace('+591', '').trim() : group.nombre}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="font-extrabold text-brand text-base">Bs {group.totalAmount}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <ConfirmModal 
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={executeDelete}
        title="Eliminar Pago"
        message="¿Estás seguro de que deseas eliminar este pago permanentemente?"
      />
    </motion.div>
  );
}

function ReconciliationModal({ onClose, selectedDates, payments, customers, pedidos, onAddPayment, onSelectPerson }: any) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const compressImage = (file: File): Promise<{ data: string, mimeType: string }> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          // Max dimension 1600px
          const maxDim = 1600;
          if (width > height && width > maxDim) {
            height = (height * maxDim) / width;
            width = maxDim;
          } else if (height > maxDim) {
            width = (width * maxDim) / height;
            height = maxDim;
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          // Compress as JPEG 0.7
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve({
            data: dataUrl.split(',')[1],
            mimeType: 'image/jpeg'
          });
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const getProbabilityLabel = (score: number) => {
    if (score >= 80) return "alta probabilidad";
    if (score >= 40) return "media probabilidad";
    return "baja probabilidad";
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    setError(null);
    try {
      const imageData = await Promise.all(Array.from(files).map(file => compressImage(file)));
      
      // Format date for Gemini (e.g., "7 de abril")
      const dateStr = selectedDates[0].toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
      
      const bankPayments = await processBankScreenshots(imageData, dateStr);
      const reconResult = reconcilePayments(bankPayments, payments, customers, pedidos);
      setResult(reconResult);
    } catch (err: any) {
      console.error("Reconciliation error:", err);
      setError("No se pudo procesar la imagen. Verifica tu conexión o intenta con otra captura.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <motion.div 
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="modal-content-modern max-w-md w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-brand/10 flex items-center justify-center text-brand">
              <FileCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-black text-base-text uppercase tracking-tight">Conciliación</h3>
              <p className="text-[10px] font-bold text-base-text-muted uppercase tracking-widest">Bancaria Automática</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-600 font-medium leading-relaxed">{error}</p>
          </div>
        )}

        {!result && !loading && (
          <div className="space-y-6">
            <div className="p-8 border-2 border-dashed border-gray-100 rounded-3xl flex flex-col items-center justify-center text-center space-y-4 bg-gray-50/30">
              <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center text-brand">
                <Camera className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm font-bold text-base-text">Sube capturas del extracto</p>
                <p className="text-[10px] text-base-text-muted mt-1 uppercase tracking-wider">Puedes seleccionar varias imágenes a la vez</p>
              </div>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="btn-pill-primary px-8 py-3"
              >
                Seleccionar Imágenes
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                accept="image/*"
                multiple
              />
            </div>
            
            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex gap-3">
              <Lightbulb className="w-5 h-5 text-blue-500 shrink-0" />
              <p className="text-[11px] text-blue-700 font-medium leading-relaxed">
                Tip: Asegúrate de que los montos y las horas sean legibles para una mejor precisión.
              </p>
            </div>
          </div>
        )}

        {loading && (
          <div className="py-20 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="w-12 h-12 text-brand animate-spin" />
            <div className="text-center">
              <p className="text-sm font-black text-base-text uppercase tracking-widest">Analizando captura...</p>
              <p className="text-[10px] text-base-text-muted mt-1 uppercase tracking-widest">Gemini está procesando los datos</p>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-6 py-2">
            {result.matches ? (
              <div className="space-y-6">
                {/* Success Header - More Compact */}
                <div className="flex items-center gap-4 p-6 bg-emerald-50 rounded-[2rem] border border-emerald-100">
                  <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-200 shrink-0 animate-bounce-subtle">
                    <Check className="w-10 h-10 stroke-[4]" />
                  </div>
                  <div className="text-left">
                    <h4 className="text-xl font-black text-emerald-900 uppercase tracking-tight leading-none">Todo cuadra</h4>
                    <p className="text-[10px] font-bold text-emerald-600/80 uppercase tracking-widest mt-1">Validación Exitosa</p>
                  </div>
                </div>

                {/* Comparison Grid */}
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {/* Total Amount Check */}
                    <div className="p-4 bg-gray-50 rounded-3xl border border-gray-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Monto Total</p>
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-medium text-gray-500">Banco</span>
                          <span className="text-xs font-black text-base-text">Bs {result.bankPayments.reduce((acc, p) => acc + p.amount, 0)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-medium text-gray-500">App</span>
                          <span className="text-xs font-bold text-gray-400">Bs {result.appPayments.reduce((acc, p) => acc + Number(p.pago), 0)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Transaction Count Check */}
                    <div className="p-4 bg-gray-50 rounded-3xl border border-gray-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Total Pagos</p>
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-medium text-gray-500">Banco</span>
                          <span className="text-xs font-black text-base-text">{result.bankPayments.length}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-medium text-gray-500">App</span>
                          <span className="text-xs font-bold text-gray-400">{result.appPayments.length}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Verification Status */}
                  <div className="flex items-center gap-3 p-3 bg-emerald-50/50 rounded-2xl border border-emerald-100/50">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Datos verificados correctamente</span>
                  </div>
                </div>

                <button 
                  onClick={onClose}
                  className="btn-pill-primary w-full py-4 text-sm shadow-emerald-200/50"
                >
                  Entendido
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Error Header - More Compact */}
                <div className="flex items-center gap-4 p-6 bg-rose-50 rounded-[2rem] border border-rose-100">
                  <div className="w-16 h-16 bg-rose-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-rose-200 shrink-0 animate-pulse-subtle">
                    <X className="w-10 h-10 stroke-[4]" />
                  </div>
                  <div className="text-left flex-1">
                    <h4 className="text-xl font-black text-rose-900 uppercase tracking-tight leading-none">Pagos no coinciden</h4>
                    <div className="mt-2 inline-block px-2 py-1 bg-white/50 rounded-lg">
                      <p className="text-[9px] font-black text-rose-600 uppercase tracking-widest">
                        {result.missingInApp.length > 0 
                          ? `Faltan: ${result.missingInApp.length} ${result.missingInApp.length === 1 ? 'pago' : 'pagos'} de Bs ${result.missingInApp[0]?.amount || 0}`
                          : `Sobran: ${result.extraInApp.length} ${result.extraInApp.length === 1 ? 'pago' : 'pagos'} en la App`
                        }
                      </p>
                    </div>
                  </div>
                </div>

                {/* Candidates List */}
                {result.candidates.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center px-2">
                      <p className="text-[9px] font-black text-base-text-muted uppercase tracking-[0.2em]">Posibles responsables</p>
                    </div>
                    
                    <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1 scrollbar-hide">
                      {result.candidates.map((c, i) => (
                        <div 
                          key={i} 
                          onClick={() => onSelectPerson(c.customerId || cleanName(c.name))}
                          className="card-modern p-4 flex justify-between items-center hover:border-brand hover:shadow-md transition-all cursor-pointer active:scale-[0.98] bg-white border-gray-100"
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-black text-base-text uppercase tracking-tight">{c.name}</span>
                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-tighter w-fit ${
                              c.score >= 80 ? 'bg-emerald-100 text-emerald-600' : 
                              c.score >= 40 ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-400'
                            }`}>
                              {getProbabilityLabel(c.score)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-black text-base-text">Bs {c.missingAmount}</span>
                            <div className="w-8 h-8 bg-brand/10 text-brand rounded-xl flex items-center justify-center group-hover:bg-brand group-hover:text-white transition-all">
                              <Plus className="w-4 h-4" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-8 border-2 border-dashed border-gray-200 rounded-[2rem] bg-gray-50/50 space-y-3">
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center text-gray-400 mx-auto">
                      <FileSearch className="w-5 h-5" />
                    </div>
                    <p className="text-[10px] font-bold text-base-text-muted uppercase tracking-widest leading-relaxed px-4">
                      No se encontraron clientes con pagos pendientes que coincidan.
                    </p>
                    <button 
                      onClick={() => {
                        setResult(null);
                        fileInputRef.current?.click();
                      }}
                      className="text-brand font-black text-[9px] uppercase tracking-[0.2em] hover:underline"
                    >
                      Reintentar Captura
                    </button>
                  </div>
                )}
              </div>
            )}

            <button 
              onClick={() => { setResult(null); }}
              className="w-full py-4 text-xs font-black text-base-text-muted uppercase tracking-[0.2em] hover:text-brand transition-colors"
            >
              Analizar otra captura
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function AddPaymentModal({ onClose, editingPayment, defaultDate, customers = [], payments = [], onRefresh }: any) {
  const [name, setName] = useState(editingPayment?.nombre || '');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(editingPayment?.customerId || null);
  const [amount, setAmount] = useState(editingPayment?.pago?.toString() || '');
  const [phone, setPhone] = useState(editingPayment?.phone || '');
  const [date, setDate] = useState(() => {
    const d = editingPayment?.date ? parseAppDate(editingPayment.date) : (defaultDate || new Date());
    return d ? d.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
  });
  const [filteredCustomers, setFilteredCustomers] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchCustomerPhone = async () => {
      if (phone) return; // Don't overwrite if already set (e.g. from OCR)
      if (editingPayment?.customerId) {
        const docRef = doc(db, 'customers', editingPayment.customerId);
        const docSnap = await getDocs(query(collection(db, 'customers'), where('__name__', '==', editingPayment.customerId)));
        if (!docSnap.empty) {
          setPhone(docSnap.docs[0].data().phone || '');
        }
      } else if (editingPayment?.nombre) {
        // Try to find by name if no customerId yet
        const q = query(collection(db, 'customers'), where('name', '==', cleanName(editingPayment.nombre)), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
          setPhone(snap.docs[0].data().phone || '');
        }
      }
    };
    fetchCustomerPhone();
  }, [editingPayment]);

  const handleNameChange = (val: string) => {
    const upperVal = val.toUpperCase();
    setName(upperVal);
    setSelectedCustomerId(null); // Reset if typing manually
    if (upperVal.length >= 1) {
      const search = normalizeName(upperVal);
      const filtered = customers.filter((c: any) => {
        const matchesName = normalizeName(c.name).includes(search);
        const matchesPhone = c.phone && c.phone.includes(search);
        return matchesName || matchesPhone;
      }).slice(0, 6);
      setFilteredCustomers(filtered);
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  const selectCustomer = (c: any) => {
    setName(c.name);
    setPhone(c.phone || '');
    setSelectedCustomerId(c.id);
    setShowSuggestions(false);
  };

  const getOrCreateCustomer = async (customerName: string, phone?: string) => {
    const upperName = customerName.toUpperCase().trim();
    const cleanedName = cleanName(upperName);

    // Buscar en el estado local primero (ya cargado desde Supabase)
    const existing = customers.find((c: any) =>
      cleanName(c.name) === cleanedName || cleanName(c.canonicalName ?? '') === cleanedName
    );

    if (existing) {
      if (phone && !existing.phone) {
        await clientesApi.update(existing.id, { phone });
      }
      return existing.id;
    }

    // Crear nuevo cliente en Supabase
    const newCustomer = await clientesApi.create({
      name: upperName,
      canonicalName: cleanedName,
      phone: phone || '',
    });
    return String(newCustomer.id);
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!name || !amount || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      // Convert date string to ISO format correctly to avoid timezone offsets
      const now = new Date();
      const [year, month, day] = date.split('-').map(Number);
      const selectedD = new Date(year, month - 1, day, 12, 0, 0);
      let finalDateStr = date;
      
      if (selectedD.toDateString() === now.toDateString()) {
        // If it's today, we can use the current time for better sorting
        finalDateStr = now.toISOString();
      } else {
        // For other days, we use noon to ensure it stays on the same day across timezones
        finalDateStr = selectedD.toISOString();
      }

      // Get or create customer profile
      const customerId = selectedCustomerId || await getOrCreateCustomer(name, phone);

      const data: any = {
        nombre: cleanName(name),
        pago: Number(amount),
        status: 'Completado',
        date: finalDateStr,
        customerId: customerId
      };

      if (editingPayment) {
        await pagosApi.update(editingPayment.id, data);
      } else {
        await pagosApi.create(data);
        // Crear pedido automático en estado "procesar" para que aparezca la tarjeta azul en el perfil
        await pedidosApi.create({
          customerId: customerId,
          customerName: cleanName(name),
          itemCount: 0,
          bagCount: 1,
          label: '',
          labelType: '',
          status: 'procesar',
          totalAmount: Number(amount),
        });
      }
      onRefresh?.();
      onClose();
    } catch (error) {
      console.error('Error saving payment:', error);
      alert('Error al guardar el pago. Por favor, intenta de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center p-4">
      <div className="absolute inset-0 bg-base-text/20 backdrop-blur-sm" onClick={onClose} />
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        className="bg-white w-full max-w-sm rounded-[32px] p-8 relative z-10 shadow-2xl"
      >
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-xl font-extrabold text-base-text tracking-tight uppercase">
            {editingPayment ? 'Editar Pago' : 'Registrar Pago'}
          </h3>
          <button onClick={onClose} className="p-2 rounded-full bg-gray-50 text-base-text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5 relative" ref={suggestionsRef}>
            <label className="text-[10px] font-bold text-base-text-muted uppercase tracking-wider ml-1">Nombre Clienta</label>
            <input 
              type="text" placeholder="Ej. Ana Garcia" 
              className="input-modern"
              value={name} onChange={e => handleNameChange(e.target.value)} required
              onFocus={() => name.length >= 1 && setShowSuggestions(true)}
            />
            {showSuggestions && filteredCustomers.length > 0 && (
              <div className="absolute top-full left-0 right-0 bg-white border border-gray-100 rounded-2xl shadow-xl z-20 mt-1 overflow-hidden">
                <div className="p-2 bg-gray-50 border-b border-gray-100">
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-2">Clientes Existentes</span>
                </div>
                {filteredCustomers.map((c, idx) => (
                  <button
                    key={`${c.id}-${idx}`}
                    type="button"
                    onClick={() => selectCustomer(c)}
                    className="w-full px-4 py-3 text-left hover:bg-brand/5 flex items-center gap-3 border-b border-gray-50 last:border-0 group transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center text-brand font-bold text-xs group-hover:bg-brand group-hover:text-white transition-colors">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-base-text group-hover:text-brand transition-colors">{c.name}</span>
                      {c.phone && <span className="text-[10px] text-base-text-muted">{c.phone}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {showSuggestions && filteredCustomers.length === 0 && name.length >= 2 && (
              <div className="absolute top-full left-0 right-0 bg-white border border-gray-100 rounded-2xl shadow-xl z-20 mt-1 overflow-hidden p-4 text-center">
                <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500 mx-auto mb-2">
                  <Plus size={20} />
                </div>
                <p className="text-xs font-bold text-base-text">Nuevo Cliente</p>
                <p className="text-[10px] text-base-text-muted">Se creará un perfil para "{name}"</p>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-base-text-muted uppercase tracking-wider ml-1">WhatsApp (Opcional)</label>
            <input 
              type="tel" placeholder="70012345" 
              className="input-modern"
              value={phone} onChange={e => setPhone(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-base-text-muted uppercase tracking-wider ml-1">Monto Bs</label>
            <input 
              type="number" placeholder="0.00" 
              className="input-modern"
              value={amount} onChange={e => setAmount(e.target.value)} required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-base-text-muted uppercase tracking-wider ml-1">Fecha de Pago</label>
            <div className="relative">
              <input 
                type="date" 
                className="input-modern pr-10"
                value={date} onChange={e => setDate(e.target.value)} required
              />
              <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-base-text-muted pointer-events-none" />
            </div>
          </div>
          <button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full btn-pill-primary py-4 mt-4 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Guardando...</span>
              </>
            ) : (
              editingPayment ? 'Actualizar Pago' : 'Confirmar Pago'
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

function ContextMenu({ onClose, onDuplicate, onDelete }: any) {
  return (
    <div 
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/10 backdrop-blur-[1px]" 
      onClick={onClose}
      onContextMenu={(e) => e.preventDefault()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-white rounded-full shadow-2xl flex items-center px-1 py-1 gap-0.5 border border-gray-100 z-[301]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onDuplicate(); onClose(); }}
          className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 active:bg-gray-100 rounded-full transition-colors group"
        >
          <Copy className="w-4 h-4 text-slate-400 group-hover:text-brand" />
          <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Duplicar</span>
        </button>
        
        <div className="w-[1px] h-6 bg-gray-200" />
        
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); onClose(); }}
          className="flex items-center gap-2 px-4 py-2.5 hover:bg-rose-50 active:bg-rose-100 rounded-full transition-colors group"
        >
          <Trash2 className="w-4 h-4 text-rose-500" />
          <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Eliminar</span>
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="p-2.5 hover:bg-gray-50 rounded-full transition-colors text-slate-300 ml-1"
        >
          <X className="w-4 h-4" />
        </button>
      </motion.div>
    </div>
  );
}

function FinanceView({ transactions, categories, onOcr, ocrLoading, onAdd, onEdit }: any) {
  const [showDetails, setShowDetails] = useState<'income' | 'expense' | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    transaction: any;
  } | null>(null);

  const longPressTimer = useRef<any>(null);
  const isLongPressActive = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent, t: any) => {
    // Only handle primary pointer (left click or single touch)
    if (!e.isPrimary) return;
    
    isLongPressActive.current = false;
    const x = e.clientX;
    const y = e.clientY;
    startPos.current = { x, y };

    longPressTimer.current = setTimeout(() => {
      isLongPressActive.current = true;
      if (window.navigator.vibrate) {
        window.navigator.vibrate(10);
      }
      setContextMenu({ x, y, transaction: t });
      longPressTimer.current = null;
    }, 400);
  };

  const handlePointerUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!longPressTimer.current) return;
    
    // Allow a small amount of movement (10px) before cancelling
    const dx = e.clientX - startPos.current.x;
    const dy = e.clientY - startPos.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 10) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'transactions', id));
    } catch (error) {
      console.error("Error deleting transaction:", error);
    }
  };

  const handleDuplicate = async (t: any) => {
    try {
      const { id, ...data } = t;
      await addDoc(collection(db, 'transactions'), {
        ...data,
        fecha: serverTimestamp(),
        createdAt: serverTimestamp(),
        description: `${data.description} (Copia)`
      });
    } catch (error) {
      console.error("Error duplicating transaction:", error);
    }
  };

  const income = transactions.filter((t: any) => t.type === 'income').reduce((acc: number, t: any) => acc + t.amount, 0);
  const expenses = transactions.filter((t: any) => t.type === 'expense').reduce((acc: number, t: any) => acc + t.amount, 0);
  const balance = income - expenses;

  // Preparar datos para el análisis detallado
  const incomeData: CategoryData[] = useMemo(() => {
    const grouped = transactions
      .filter((t: any) => t.type === 'income')
      .reduce((acc: any, t: any) => {
        acc[t.category] = (acc[t.category] || 0) + t.amount;
        return acc;
      }, {});

    return Object.entries(grouped).map(([name, value], index) => ({
      name,
      value: value as number,
      color: COLORS[index % COLORS.length]
    }));
  }, [transactions]);

  const expenseData: CategoryData[] = useMemo(() => {
    const grouped = transactions
      .filter((t: any) => t.type === 'expense')
      .reduce((acc: any, t: any) => {
        acc[t.category] = (acc[t.category] || 0) + t.amount;
        return acc;
      }, {});

    return Object.entries(grouped).map(([name, value], index) => ({
      name,
      value: value as number,
      color: COLORS[index % COLORS.length]
    }));
  }, [transactions]);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.1, ease: "linear" }}
      className="space-y-6 pb-20"
    >
      <AnimatePresence>
        {showDetails && (
          <DetailedAnalysis
            type={showDetails}
            onBack={() => setShowDetails(null)}
            incomeData={incomeData}
            expenseData={expenseData}
          />
        )}
      </AnimatePresence>
      {/* Header */}
      <div className="flex justify-between items-center px-1">
        <h2 className="text-2xl font-extrabold text-base-text tracking-tight">Finanzas</h2>
        <div className="flex gap-2">
          <label className="btn-tertiary text-xs cursor-pointer">
            <Camera className="w-4 h-4" />
            OCR
            <input type="file" accept="image/*" className="hidden" onChange={onOcr} disabled={ocrLoading} />
          </label>
          <button onClick={onAdd} className="btn-tertiary-brand text-xs">
            <Plus className="w-4 h-4" />
            Transacción
          </button>
        </div>
      </div>

      {ocrLoading && (
        <div className="bg-brand-secondary p-4 rounded-[20px] flex items-center gap-3 border border-brand/10">
          <Loader2 className="w-5 h-5 text-brand animate-spin" />
          <p className="text-xs font-bold text-brand uppercase tracking-wider">Procesando captura...</p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div 
          onClick={() => setShowDetails('income')}
          className="card-modern p-4 bg-emerald-50/30 border-emerald-100 cursor-pointer active:scale-95 transition-transform"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-emerald-500 rounded-lg text-white">
              <TrendingUp className="w-3 h-3" />
            </div>
            <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Ingresos Totales</span>
          </div>
          <h3 className="text-xl font-extrabold text-base-text">Bs {income.toLocaleString()}</h3>
        </div>
        <div 
          onClick={() => setShowDetails('expense')}
          className="card-modern p-4 bg-rose-50/30 border-rose-100 cursor-pointer active:scale-95 transition-transform"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-rose-500 rounded-lg text-white">
              <TrendingDown className="w-3 h-3" />
            </div>
            <span className="text-[9px] font-bold text-rose-600 uppercase tracking-wider">Gastos Totales</span>
          </div>
          <h3 className="text-xl font-extrabold text-base-text">Bs {expenses.toLocaleString()}</h3>
        </div>
      </div>

      {/* History */}
      <div className="space-y-3">
        <div className="flex justify-between items-center px-1">
          <h3 className="text-[11px] font-bold text-base-text-muted uppercase tracking-[0.15em]">Historial</h3>
          <span className="text-[10px] font-bold text-brand uppercase tracking-wider">Balance: Bs {balance.toLocaleString()}</span>
        </div>
        <div className="divide-y divide-gray-100/50">
          {transactions.length === 0 ? (
            <div className="text-center py-10 opacity-20">
              <TrendingDown className="w-8 h-8 mx-auto mb-2" />
              <p className="text-[10px] font-bold uppercase tracking-widest">Sin movimientos</p>
            </div>
          ) : (
            transactions.map((t: any, tIdx: number) => {
              const categoryObj = categories.find((c: any) => c.name === t.category);
              const Icon = categoryObj ? (CATEGORY_ICONS[categoryObj.icon] || MoreHorizontal) : MoreHorizontal;
              const displayTitle = t.subcategory || t.category;
              
              return (
                <motion.div 
                  key={`tx-${t.id}-${tIdx}`} 
                  onPointerDown={(e) => handlePointerDown(e, t)}
                  onPointerUp={handlePointerUp}
                  onPointerMove={handlePointerMove}
                  onPointerCancel={handlePointerUp}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    if (isLongPressActive.current) {
                      e.preventDefault();
                      e.stopPropagation();
                      return;
                    }
                    onEdit(t);
                  }}
                  whileTap={{ scale: 0.98 }}
                  className="py-2.5 flex items-center justify-between hover:bg-gray-50/50 active:bg-gray-100/50 transition-colors cursor-pointer group relative select-none touch-pan-y"
                  style={{ WebkitTouchCallout: 'none' }}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110",
                      t.type === 'income' ? 'bg-emerald-400/80 text-white' : 'bg-rose-400/80 text-white'
                    )}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-black text-base-text uppercase tracking-wider leading-tight">
                          {displayTitle}
                        </span>
                        {t.isRecurring && <RefreshCw className="w-2.5 h-2.5 text-brand/60" />}
                      </div>
                      <span className="text-[8px] font-bold text-base-text-muted/60 uppercase tracking-tighter mt-0.5">
                        {formatTransactionDate(t.date)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "px-2.5 py-1 rounded-full",
                      t.type === 'income' ? "bg-emerald-50/50" : "bg-rose-50/50"
                    )}>
                      <span className={cn(
                        "text-[11px] font-black tracking-tight",
                        t.type === 'income' ? "text-emerald-500/80" : "text-rose-500/80"
                      )}>
                        {t.type === 'income' ? '+' : '-'}Bs {t.amount.toLocaleString()}
                      </span>
                    </div>
                    {t.status === 'pending' && (
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    )}
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </div>

      <AnimatePresence>
        {contextMenu && (
          <ContextMenu 
            onClose={() => setContextMenu(null)}
            onDuplicate={() => handleDuplicate(contextMenu.transaction)}
            onDelete={() => handleDelete(contextMenu.transaction.id)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// SettingsView → extraída a src/pages/SettingsPage.tsx
import SettingsView from './pages/SettingsPage';

function AddOrderModal({ onClose }: any) {
  const [name, setName] = useState('');
  const [wa, setWa] = useState('');
  const [total, setTotal] = useState('');

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    await addDoc(collection(db, 'orders'), {
      customerName: cleanName(name),
      whatsapp: wa,
      total: Number(total),
      status: 'pending',
      fecha: serverTimestamp()
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-base-text/20 backdrop-blur-sm" 
        onClick={onClose} 
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-white w-full max-w-sm rounded-[32px] p-8 relative z-10 shadow-2xl"
      >
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-xl font-extrabold text-base-text tracking-tight uppercase">Nuevo Pedido</h3>
          <button onClick={onClose} className="p-2 rounded-full bg-gray-50 text-base-text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-base-text-muted uppercase tracking-wider ml-1">Nombre Clienta</label>
            <input 
              type="text" placeholder="Ej. Maria Lopez" 
              className="input-modern"
              value={name} onChange={e => setName(e.target.value)} required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-base-text-muted uppercase tracking-wider ml-1">WhatsApp</label>
            <input 
              type="text" placeholder="Ej. 78945612" 
              className="input-modern"
              value={wa} onChange={e => setWa(e.target.value)} required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-base-text-muted uppercase tracking-wider ml-1">Total Bs</label>
            <input 
              type="number" placeholder="0.00" 
              className="input-modern"
              value={total} onChange={e => setTotal(e.target.value)} required
            />
          </div>
          <button type="submit" className="w-full btn-pill-primary py-4 mt-4">Guardar Pedido</button>
        </form>
      </motion.div>
    </div>
  );
}

function AddTransactionModal({ onClose, editingTransaction, categories, onAddCategory }: any) {
  const [step, setStep] = useState(editingTransaction ? 2 : 1);
  const [type, setType] = useState<'income' | 'expense'>(editingTransaction?.type || 'expense');
  const [category, setCategory] = useState(editingTransaction?.category || '');
  const [subcategory, setSubcategory] = useState(editingTransaction?.subcategory || '');
  const [amount, setAmount] = useState(editingTransaction?.amount?.toString() || '');
  const [desc, setDesc] = useState(editingTransaction?.description || '');
  const [date, setDate] = useState(editingTransaction?.date?.seconds ? new Date(editingTransaction.date.seconds * 1000).toISOString().split('T')[0] : (editingTransaction?.date ? new Date(editingTransaction.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]));
  const [account, setAccount] = useState(editingTransaction?.account || '');
  const [beneficiary, setBeneficiary] = useState(editingTransaction?.beneficiary || '');
  const [tags, setTags] = useState(editingTransaction?.tags || '');
  const [status, setStatus] = useState<'paid' | 'pending'>(editingTransaction?.status || 'paid');
  const [isRecurring, setIsRecurring] = useState(editingTransaction?.isRecurring || false);

  // Calculator State
  const [display, setDisplay] = useState(editingTransaction?.amount?.toString() || '0');
  const [formula, setFormula] = useState('');
  const [activeOperator, setActiveOperator] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [isPaid, setIsPaid] = useState(editingTransaction ? editingTransaction.status === 'paid' : true);
  const [isAutomatic, setIsAutomatic] = useState(false);
  const [recurrence, setRecurrence] = useState<'Nunca' | 'Cada día' | 'Cada semana' | 'Cada 2 semanas' | 'Cada mes' | 'Cada año' | 'Personalizar'>('Nunca');
  
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showRecurrencePicker, setShowRecurrencePicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);

  const totalAmount = useMemo(() => {
    const sum = items.reduce((sum, item) => sum + item.amount, 0) + parseFloat(display || '0');
    return sum.toFixed(2);
  }, [items, display]);

  const handleNumber = (num: string) => {
    if (display === '0' && num !== '.') {
      setDisplay(num);
    } else if (num === '.' && display.includes('.')) {
      return;
    } else {
      setDisplay(display + num);
    }
  };

  const handleOperator = (op: string) => {
    setFormula(display + ' ' + op + ' ');
    setDisplay('0');
    setActiveOperator(op);
  };

  const calculate = () => {
    if (!formula) return;
    const parts = formula.split(' ');
    const prev = parseFloat(parts[0]);
    const op = parts[1];
    const current = parseFloat(display);
    let result = 0;

    switch (op) {
      case '+': result = prev + current; break;
      case '-': result = prev - current; break;
      case '×': result = prev * current; break;
      case '÷': result = current !== 0 ? prev / current : 0; break;
    }

    setDisplay(result.toString());
    setFormula('');
    setActiveOperator(null);
  };

  const clear = () => {
    setDisplay('0');
    setFormula('');
    setActiveOperator(null);
  };

  const backspace = () => {
    if (display.length > 1) {
      setDisplay(display.slice(0, -1));
    } else {
      setDisplay('0');
    }
  };

  const addItem = () => {
    const val = parseFloat(display);
    if (val === 0) return;
    const catObj = categories.find((c: any) => c.name === category);
    const newItem: Item = {
      id: Math.random().toString(36).substr(2, 9),
      name: subcategory ? `${category} - ${subcategory}` : category,
      amount: val,
      category: catObj || { icon: 'MoreHorizontal', color: 'text-gray-500' }
    };
    setItems([...items, newItem]);
    setDisplay('0');
  };

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const handleFinalSave = async () => {
    const allItemsToSave = [...items];
    const currentVal = parseFloat(display);
    
    if (currentVal > 0) {
      const catObj = categories.find((c: any) => c.name === category);
      allItemsToSave.push({
        id: Math.random().toString(36).substr(2, 9),
        name: subcategory ? `${category} - ${subcategory}` : category,
        amount: currentVal,
        category: catObj || { icon: 'MoreHorizontal', color: 'text-gray-500' }
      });
    }

    if (allItemsToSave.length === 0) return;

    try {
      const now = new Date();
      const [year, month, day] = date.split('-').map(Number);
      const selectedD = new Date(year, month - 1, day);
      
      let finalDate: Date;
      if (selectedD.toDateString() === now.toDateString()) {
        finalDate = now;
      } else {
        finalDate = new Date(year, month - 1, day, 12, 0, 0);
      }

      for (const item of allItemsToSave) {
        const data: any = {
          type,
          category: item.category.name || item.name.split(' - ')[0],
          subcategory: item.name.includes(' - ') ? item.name.split(' - ')[1] : '',
          amount: item.amount,
          description: item.name,
          status: isPaid ? 'paid' : 'pending',
          fecha: finalDate,
          updatedAt: serverTimestamp()
        };

        if (editingTransaction && allItemsToSave.length === 1) {
          await updateDoc(doc(db, 'transactions', editingTransaction.id), data);
        } else {
          await addDoc(collection(db, 'transactions'), {
            ...data,
            createdAt: serverTimestamp()
          });
        }
      }
      onClose();
    } catch (error) {
      console.error("Error saving transaction:", error);
    }
  };

  const filteredCategories = categories.filter((c: any) => c.type === type);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
        onClick={onClose} 
      />
      
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white w-full max-w-md rounded-[32px] p-6 relative z-10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div 
              key="step1"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              className="flex-1 flex flex-col overflow-hidden"
            >
              <div className="flex justify-center items-center mb-6">
                <div className="bg-gray-100/50 p-1 rounded-[20px] flex items-center gap-1">
                  <button 
                    onClick={() => setType('expense')}
                    className={`px-8 py-2.5 rounded-[17px] transition-all duration-300 text-[15px] ${type === 'expense' ? 'bg-white text-brand shadow-md font-bold' : 'text-base-text-muted opacity-50'}`}
                  >
                    Gasto
                  </button>
                  <button 
                    onClick={() => setType('income')}
                    className={`px-8 py-2.5 rounded-[17px] transition-all duration-300 text-[15px] ${type === 'income' ? 'bg-white text-blue-600 shadow-md font-bold' : 'text-base-text-muted opacity-50'}`}
                  >
                    Ingreso
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-y-6 gap-x-2 py-2 overflow-y-auto scrollbar-hide flex-1">
                {filteredCategories.map((cat: any, idx: number) => {
                  const Icon = CATEGORY_ICONS[cat.icon] || MoreHorizontal;
                  return (
                    <button
                      key={`${cat.id || 'cat'}-${idx}`}
                      type="button"
                      onClick={() => { 
                        setCategory(cat.name); 
                        setSubcategory('');
                        if (cat.subcategories && cat.subcategories.length > 0) {
                          setStep(1.5);
                        } else {
                          setStep(2);
                        }
                      }}
                      className="flex flex-col items-center gap-2 group"
                    >
                      <div className="w-11 h-11 rounded-2xl bg-gray-50 flex items-center justify-center text-base-text transition-transform group-active:scale-90">
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-[11px] font-medium text-base-text-muted text-center leading-tight">{cat.name}</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={onAddCategory}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div className="w-11 h-11 rounded-2xl bg-gray-50 flex items-center justify-center text-base-text-muted transition-transform group-active:scale-90 border border-dashed border-gray-200">
                    <Pencil className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-medium text-base-text-muted">Editar</span>
                </button>
              </div>
            </motion.div>
          )}

          {step === 1.5 && (
            <motion.div 
              key="step1.5"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              className="flex-1 flex flex-col overflow-hidden"
            >
              <div className="flex justify-between items-center mb-6">
                <button onClick={() => setStep(1)} className="p-2 -ml-2 rounded-full text-base-text-muted hover:bg-gray-50">
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <h3 className="text-[14px] font-black text-base-text uppercase tracking-widest">{category}</h3>
                <div className="w-10" />
              </div>

              <div className="grid grid-cols-4 gap-y-6 gap-x-2 py-2 overflow-y-auto scrollbar-hide flex-1">
                {categories.find((c: any) => c.name === category)?.subcategories?.map((sub: any, subIdx: number) => {
                  const Icon = CATEGORY_ICONS[sub.icon] || MoreHorizontal;
                  return (
                    <button
                      key={`${sub.id || sub.name}-${subIdx}`}
                      type="button"
                      onClick={() => { setSubcategory(sub.name); setStep(2); }}
                      className="flex flex-col items-center gap-2 group"
                    >
                      <div className="w-11 h-11 rounded-2xl bg-gray-50 flex items-center justify-center text-base-text transition-transform group-active:scale-90">
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-[11px] font-medium text-base-text-muted text-center leading-tight">{sub.name}</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => { setSubcategory(''); setStep(2); }}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div className="w-11 h-11 rounded-2xl bg-gray-50 flex items-center justify-center text-base-text-muted transition-transform group-active:scale-90 border border-dashed border-gray-200">
                    <Plus className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-medium text-base-text-muted">Omitir</span>
                </button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div 
              key="step2"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="flex-1 flex flex-col overflow-hidden -mx-6 -mb-6"
            >
              {/* Calculator Header */}
              <div className="px-6 pt-2 pb-1 flex items-center justify-between shrink-0">
                <button 
                  onClick={() => {
                    const cat = categories.find((c: any) => c.name === category);
                    if (cat?.subcategories?.length > 0) setStep(1.5);
                    else setStep(1);
                  }} 
                  className="p-2 -ml-2 rounded-full text-base-text-muted hover:bg-gray-50"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <div className="flex bg-gray-100 p-0.5 rounded-xl">
                  {(['expense', 'income'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setType(t)}
                      className={cn(
                        "px-6 py-1.5 text-[9px] font-bold tracking-widest rounded-lg transition-all duration-300",
                        type === t 
                          ? "bg-white text-gray-900 shadow-sm" 
                          : "text-gray-400 hover:text-gray-500"
                      )}
                    >
                      {t === 'income' ? 'Ingreso' : 'Gasto'}
                    </button>
                  ))}
                </div>
                <div className="w-10" />
              </div>

              {/* Display Area */}
              <div className="px-6 py-2 flex flex-col items-end justify-center shrink-0 bg-gray-50/30">
                <div className="flex items-center justify-end w-full mb-0.5">
                  <div className="text-gray-300 text-[9px] font-medium h-3">
                    {formula}
                  </div>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-[12px] font-light text-gray-400">Bs</span>
                  <span className={cn(
                    "font-black tracking-tight text-base-text transition-all duration-300",
                    items.length > 2 ? "text-3xl" : "text-5xl"
                  )}>
                    {totalAmount}
                  </span>
                </div>
              </div>

              {/* Items & Metadata */}
              <div className="px-6 py-1 flex flex-col overflow-y-auto flex-1 min-h-0 scrollbar-hide">
                {/* List of Added Items */}
                <div className="flex flex-col gap-1">
                  {items.map((item, idx) => {
                    const Icon = CATEGORY_ICONS[item.category.icon] || MoreHorizontal;
                    return (
                      <div key={`${item.id || 'item'}-${idx}`} className="flex items-center justify-between py-2 group shrink-0 border-b border-gray-50 last:border-0">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-base-text">
                            <Icon className="w-4 h-4" />
                          </div>
                          <span className="text-[10px] font-bold text-base-text-muted truncate max-w-[150px]">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-bold text-base-text">Bs {item.amount}</span>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              removeItem(item.id);
                            }}
                            className="p-1 text-gray-300 hover:text-red-500 transition-all"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Current Input Item Row */}
                <div 
                  onClick={(e) => {
                    e.stopPropagation();
                    if (parseFloat(display) > 0) {
                      addItem();
                    }
                    setStep(1);
                  }}
                  className="flex items-center justify-between py-2 bg-brand/5 -mx-6 px-6 shrink-0 mt-1 cursor-pointer hover:bg-brand/10 transition-colors border-y border-brand/10"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg bg-white shadow-sm flex items-center justify-center text-brand">
                      {React.createElement(CATEGORY_ICONS[categories.find((c: any) => c.name === category)?.icon] || MoreHorizontal, { className: "w-5 h-5" })}
                    </div>
                    <div className="flex flex-col items-start">
                      <span className="text-[9px] font-bold text-base-text leading-none">{category}</span>
                      <span className="text-[8px] text-base-text-muted font-medium leading-none mt-0.5">{subcategory || 'General'}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg font-black text-base-text">
                      {display === '0' ? '0.00' : display}
                    </span>
                    <div className="w-[2px] h-5 bg-brand animate-pulse" />
                  </div>
                </div>

                {/* Date & Status Row */}
                <div className="flex items-center justify-between py-2 border-t border-gray-100 mt-1 relative">
                  <button 
                    onClick={() => setShowDatePicker(true)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors active:scale-95"
                  >
                    <CalendarIcon size={14} className="text-gray-400" />
                    <span className="text-[10px] font-bold text-base-text">
                      {format(new Date(date), "d 'de' MMM", { locale: es })}
                    </span>
                  </button>
                  
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (parseFloat(display) > 0) {
                          addItem();
                        }
                        setStep(1);
                      }}
                      className="p-1.5 bg-brand/10 text-brand hover:bg-brand/20 rounded-lg transition-all active:scale-90 shadow-sm"
                      title="Agregar otro pago"
                    >
                      <Plus size={16} strokeWidth={3} />
                    </button>

                    <button 
                      onClick={() => setShowStatusPicker(true)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all active:scale-95 border shadow-sm",
                        isPaid 
                          ? "bg-emerald-100 border-emerald-200 text-emerald-700" 
                          : "bg-orange-100 border-orange-200 text-orange-700"
                      )}
                    >
                      <span className="text-[10px] font-black uppercase tracking-widest">
                        {isPaid ? 'PAGADA' : 'VENCIDA'}
                      </span>
                      {isPaid ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Keypad */}
              <div className="grid grid-cols-4 gap-1 px-6 py-2 bg-gray-50/50">
                {/* Numbers */}
                <div className="col-span-3 grid grid-cols-3 gap-1">
                  {['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0'].map((num) => (
                    <button
                      key={num}
                      onClick={() => handleNumber(num)}
                      className="h-10 bg-white rounded-xl flex items-center justify-center text-base-text text-lg font-bold active:scale-95 shadow-sm"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    onClick={backspace}
                    onDoubleClick={clear}
                    className="h-10 bg-red-50 rounded-xl flex items-center justify-center text-red-500 text-lg font-bold active:scale-95 shadow-sm"
                    title="Doble clic para borrar todo"
                  >
                    <History size={18} className="rotate-180" />
                  </button>
                </div>

                {/* Operators */}
                <div className="flex flex-col gap-1">
                  {['+', '-', '×', '÷'].map((op) => (
                    <button
                      key={op}
                      onClick={() => op === '+' && display === '0' && !formula ? setStep(1) : handleOperator(op)}
                      className={cn(
                        "h-10 rounded-xl flex items-center justify-center text-lg font-light active:scale-95 shadow-sm transition-all",
                        activeOperator === op 
                          ? "bg-brand text-white shadow-brand/20 scale-105 z-10" 
                          : "bg-white text-brand"
                      )}
                    >
                      {op === '+' && <Plus size={16} />}
                      {op === '-' && <Minus size={16} />}
                      {op === '×' && <X size={16} />}
                      {op === '÷' && <Divide size={16} />}
                    </button>
                  ))}
                  <button
                    onClick={calculate}
                    className="h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white text-xl font-light active:scale-95 shadow-lg shadow-emerald-100"
                  >
                    =
                  </button>
                </div>
              </div>

              {/* Final Action Button */}
              <div className="px-6 pb-6 pt-2 bg-gray-50/50">
                <button
                  onClick={handleFinalSave}
                  className="w-full py-4 bg-brand rounded-2xl flex items-center justify-center text-white text-[14px] font-black uppercase tracking-widest active:scale-95 shadow-xl shadow-brand/30"
                >
                  Guardar
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Calculator Modals */}
      <AnimatePresence>
        {showDatePicker && (
          <CalendarModal 
            selectedDate={new Date(date)} 
            onSelect={(d: Date) => { setDate(format(d, 'yyyy-MM-dd')); setShowDatePicker(false); }} 
            onClose={() => setShowDatePicker(false)}
            isAutomatic={isAutomatic}
            setIsAutomatic={setIsAutomatic}
            recurrence={recurrence}
            setShowRecurrencePicker={setShowRecurrencePicker}
          />
        )}

        {showRecurrencePicker && (
          <FrequencyPicker 
            selected={recurrence}
            onSelect={(v: any) => { setRecurrence(v); setShowRecurrencePicker(false); }}
            onClose={() => setShowRecurrencePicker(false)}
          />
        )}

        {showStatusPicker && (
          <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/20 backdrop-blur-sm">
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="w-full max-w-md bg-white rounded-t-[32px] p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-base-text">Estado y Configuración</h3>
                <button onClick={() => setShowStatusPicker(false)} className="p-2 bg-gray-50 rounded-full">
                  <X size={20} className="text-base-text-muted" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Status Toggle */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-xl", isPaid ? "bg-emerald-100 text-emerald-600" : "bg-orange-100 text-orange-600")}>
                      {isPaid ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-base-text">{isPaid ? 'Pagada' : 'Vencida'}</p>
                      <p className="text-xs text-base-text-muted">Estado del pago</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsPaid(!isPaid)}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all",
                      isPaid ? "bg-emerald-500 text-white" : "bg-orange-500 text-white"
                    )}
                  >
                    Cambiar
                  </button>
                </div>

                {/* Automatic Toggle */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
                      <RefreshCw size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-base-text">Automático</p>
                      <p className="text-xs text-base-text-muted">Procesar automáticamente</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsAutomatic(!isAutomatic)}
                    className={cn(
                      "w-12 h-6 rounded-full transition-colors relative",
                      isAutomatic ? "bg-emerald-500" : "bg-gray-200"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                      isAutomatic ? "left-7" : "left-1"
                    )} />
                  </button>
                </div>

                {/* Recurrence Picker */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-brand/10 text-brand rounded-xl">
                      <Clock size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-base-text">Repetir</p>
                      <p className="text-xs text-base-text-muted">Frecuencia de repetición</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setShowStatusPicker(false);
                      setShowRecurrencePicker(true);
                    }}
                    className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-base-text"
                  >
                    {recurrence}
                  </button>
                </div>
              </div>

              <button 
                onClick={() => setShowStatusPicker(false)}
                className="w-full mt-6 py-4 bg-base-text text-white rounded-2xl font-bold text-sm active:scale-95 transition-transform"
              >
                Listo
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>

  );
}

function AddCategoryModal({ onClose, categories }: { onClose: () => void, categories: Category[] }) {
  const [view, setView] = useState<'list' | 'form'>('list');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [selectedIcon, setSelectedIcon] = useState('MoreHorizontal');
  const [selectedColor, setSelectedColor] = useState('#64748b');
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [newSubName, setNewSubName] = useState('');
  const [newSubIcon, setNewSubIcon] = useState('Plus');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const ICON_LIST = Object.keys(CATEGORY_ICONS);
  const COLOR_LIST = [
    '#6366f1', '#f97316', '#10b981', '#3b82f6', '#ec4899', 
    '#a855f7', '#64748b', '#ef4444', '#f59e0b', '#06b6d4'
  ];

  useEffect(() => {
    if (editingCategory) {
      setName(editingCategory.name);
      setType(editingCategory.type);
      setSelectedIcon(editingCategory.icon);
      setSelectedColor(editingCategory.color);
      setSubcategories(editingCategory.subcategories || []);
    } else {
      setName('');
      setType('expense');
      setSelectedIcon('MoreHorizontal');
      setSelectedColor('#64748b');
      setSubcategories([]);
    }
  }, [editingCategory]);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!name) return;
    
    const data = {
      name,
      type,
      icon: selectedIcon,
      color: selectedColor,
      subcategories,
      updatedAt: serverTimestamp()
    };

    if (editingCategory) {
      await updateDoc(doc(db, 'categories', editingCategory.id), data);
    } else {
      await addDoc(collection(db, 'categories'), {
        ...data,
        createdAt: serverTimestamp()
      });
    }
    setView('list');
    setEditingCategory(null);
    setShowDeleteConfirm(false);
  };

  const handleDeleteCategory = async () => {
    if (!editingCategory) return;
    await deleteDoc(doc(db, 'categories', editingCategory.id));
    setView('list');
    setEditingCategory(null);
    setShowDeleteConfirm(false);
  };

  const addSubcategory = () => {
    if (!newSubName) return;
    const newSub: Subcategory = {
      id: Math.random().toString(36).substr(2, 9),
      name: newSubName,
      icon: newSubIcon
    };
    setSubcategories([...subcategories, newSub]);
    setNewSubName('');
    setNewSubIcon('Plus');
  };

  const removeSubcategory = (id: string) => {
    setSubcategories(subcategories.filter(s => s.id !== id));
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-base-text/20 backdrop-blur-sm" 
        onClick={onClose} 
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white w-full max-w-md rounded-[32px] p-6 relative z-10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="relative flex items-center justify-center mb-6 min-h-[40px]">
          {view === 'form' && (
            <button 
              onClick={() => { setView('list'); setShowDeleteConfirm(false); }} 
              className="absolute left-0 p-2 rounded-full hover:bg-gray-50"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          
          {view === 'form' ? (
            <div className="bg-gray-100/50 p-1 rounded-[20px] flex items-center gap-1">
              <button 
                type="button"
                onClick={() => setType('expense')}
                className={`px-8 py-2.5 rounded-[17px] transition-all duration-300 text-[15px] ${type === 'expense' ? 'bg-white text-brand shadow-md font-bold' : 'text-base-text-muted opacity-50'}`}
              >
                Gasto
              </button>
              <button 
                type="button"
                onClick={() => setType('income')}
                className={`px-8 py-2.5 rounded-[17px] transition-all duration-300 text-[15px] ${type === 'income' ? 'bg-white text-blue-600 shadow-md font-bold' : 'text-base-text-muted opacity-50'}`}
              >
                Ingreso
              </button>
            </div>
          ) : (
            <h3 className="text-[14px] font-black text-base-text uppercase tracking-widest">
              Categorías
            </h3>
          )}
        </div>

        {view === 'list' ? (
          <div className="space-y-6 overflow-y-auto pr-2 scrollbar-hide flex-1">
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-bold text-base-text-muted uppercase tracking-widest opacity-50">Gastos</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {categories.filter(c => c.type === 'expense').map((cat, idx) => (
                  <button
                    key={`${cat.id || 'exp'}-${idx}`}
                    onClick={() => { setEditingCategory(cat); setView('form'); }}
                    className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 hover:bg-gray-100 transition-all text-left group"
                  >
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center text-base-text bg-white shadow-sm">
                      {React.createElement(CATEGORY_ICONS[cat.icon] || MoreHorizontal, { className: "w-5 h-5" })}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[13px] font-bold text-base-text truncate">{cat.name}</span>
                      <span className="text-[10px] text-base-text-muted truncate">{cat.subcategories?.length || 0} subcats</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-bold text-base-text-muted uppercase tracking-widest opacity-50">Ingresos</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {categories.filter(c => c.type === 'income').map((cat, idx) => (
                  <button
                    key={`${cat.id || 'inc'}-${idx}`}
                    onClick={() => { setEditingCategory(cat); setView('form'); }}
                    className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 hover:bg-gray-100 transition-all text-left group"
                  >
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center text-base-text bg-white shadow-sm">
                      {React.createElement(CATEGORY_ICONS[cat.icon] || MoreHorizontal, { className: "w-5 h-5" })}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[13px] font-bold text-base-text truncate">{cat.name}</span>
                      <span className="text-[10px] text-base-text-muted truncate">{cat.subcategories?.length || 0} subcats</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-4 sticky bottom-0 bg-white/90 backdrop-blur-sm pb-2">
              <button 
                onClick={() => { setEditingCategory(null); setView('form'); }}
                className="flex-1 bg-brand text-white py-4 rounded-2xl text-[14px] font-black uppercase tracking-widest shadow-lg shadow-brand/20 active:scale-95 transition-transform"
              >
                Nueva Categoría
              </button>
              <button 
                onClick={async () => {
                  if (confirm('¿Restablecer todas las categorías a los valores predeterminados?')) {
                    for (const cat of categories) {
                      await deleteDoc(doc(db, 'categories', cat.id));
                    }
                  }
                }}
                className="p-4 bg-gray-100 text-base-text-muted rounded-2xl hover:bg-gray-200 transition-colors active:scale-95"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto pr-2 scrollbar-hide flex-1 pb-2">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-base-text-muted uppercase tracking-widest ml-1">Nombre de Categoría</label>
              <input 
                type="text" placeholder="Ej. Gimnasio" 
                className="w-full bg-gray-50 border-none py-3 px-4 rounded-xl text-[14px] font-medium text-base-text placeholder-gray-300 focus:ring-2 focus:ring-brand/20 transition-all"
                value={name} onChange={e => setName(e.target.value)} required
              />
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-base-text-muted uppercase tracking-widest ml-1">Icono Principal</label>
              <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2 scrollbar-hide p-1">
                {ICON_GROUPS.map(group => (
                  <div key={group.name} className="space-y-1">
                    <span className="text-[9px] font-bold text-base-text-muted uppercase tracking-widest ml-1 opacity-50">{group.name}</span>
                    <div className="grid grid-cols-6 gap-2">
                      {group.icons.map((iconName, iconIdx) => {
                        const Icon = CATEGORY_ICONS[iconName] || MoreHorizontal;
                        return (
                          <button
                            key={`${group.name}-${iconName}-${iconIdx}`}
                            type="button"
                            onClick={() => setSelectedIcon(iconName)}
                            className={`aspect-square rounded-xl flex items-center justify-center transition-all ${selectedIcon === iconName ? 'bg-brand text-white shadow-lg scale-110' : 'bg-gray-50 hover:bg-gray-100 text-base-text-muted'}`}
                          >
                            <Icon className="w-5 h-5" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-base-text-muted uppercase tracking-widest ml-1">Subcategorías</label>
              <div className="space-y-3 bg-gray-50 p-3 rounded-2xl">
                <div className="flex gap-2">
                  <input 
                    type="text" placeholder="Añadir subcategoría..." 
                    className="flex-1 bg-white border-none py-2 px-3 rounded-lg text-[13px] font-medium text-base-text placeholder-gray-300 focus:ring-2 focus:ring-brand/20 transition-all"
                    value={newSubName} onChange={e => setNewSubName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSubcategory())}
                  />
                  <button 
                    type="button"
                    onClick={addSubcategory}
                    className="px-3 bg-brand text-white rounded-lg font-black text-[12px] shadow-lg shadow-brand/20 active:scale-90 transition-transform"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-1 max-h-[100px] overflow-y-auto pr-2 scrollbar-hide">
                  {subcategories.map((sub, idx) => (
                    <div key={`${sub.id || 'sub'}-${idx}`} className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-100 shadow-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <button 
                          type="button"
                          onClick={() => {
                            const currentIndex = sub.icon ? ICON_LIST.indexOf(sub.icon) : -1;
                            const nextIcon = ICON_LIST[(currentIndex + 1) % ICON_LIST.length];
                            setSubcategories(subcategories.map(s => s.id === sub.id ? { ...s, icon: nextIcon } : s));
                          }}
                          className="w-7 h-7 rounded-md flex items-center justify-center text-base-text-muted bg-gray-50 hover:bg-gray-100 transition-colors"
                        >
                          {React.createElement(CATEGORY_ICONS[sub.icon] || MoreHorizontal, { className: "w-4 h-4" })}
                        </button>
                        <input 
                          type="text" 
                          value={sub.name}
                          onChange={(e) => setSubcategories(subcategories.map(s => s.id === sub.id ? { ...s, name: e.target.value } : s))}
                          className="text-[13px] font-medium text-base-text bg-transparent border-none p-0 focus:ring-0 truncate"
                        />
                      </div>
                      <button 
                        type="button" 
                        onClick={() => removeSubcategory(sub.id)}
                        className="p-1.5 text-red-400 hover:bg-red-50 rounded-md transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              {showDeleteConfirm ? (
                <div className="bg-red-50 p-4 rounded-2xl border border-red-100 flex flex-col gap-3 animate-in fade-in zoom-in duration-200">
                  <p className="text-[11px] font-bold text-red-600 text-center uppercase tracking-widest">¿Confirmar eliminación?</p>
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={handleDeleteCategory}
                      className="flex-1 bg-red-500 text-white py-3 rounded-xl text-[12px] font-black uppercase tracking-widest shadow-lg shadow-red-500/20 active:scale-95 transition-transform"
                    >
                      Sí, Eliminar
                    </button>
                    <button 
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 bg-white text-base-text-muted py-3 rounded-xl text-[12px] font-black uppercase tracking-widest border border-gray-200 active:scale-95 transition-transform"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <button 
                    type="submit" 
                    className={`w-full py-4 rounded-2xl text-[14px] font-black uppercase tracking-widest shadow-lg transition-all active:scale-95 ${type === 'expense' ? 'bg-brand text-white shadow-brand/20' : 'bg-blue-600 text-white shadow-blue-600/20'}`}
                  >
                    {editingCategory ? 'Guardar Cambios' : 'Crear Categoría'}
                  </button>
                  {editingCategory && (
                    <button 
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      className="w-full py-2 text-[12px] font-bold text-red-500 uppercase tracking-widest hover:bg-red-50 rounded-xl transition-all active:scale-95"
                    >
                      Eliminar Categoría
                    </button>
                  )}
                </div>
              )}
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}

function AddLiveModal({ onClose }: any) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    await addDoc(collection(db, 'live_sessions'), {
      title,
      scheduledAt: new Date(date),
      status: 'scheduled',
      duration: 60
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-base-text/20 backdrop-blur-sm" 
        onClick={onClose} 
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-white w-full max-w-sm rounded-[32px] p-8 relative z-10 shadow-2xl"
      >
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-xl font-extrabold text-base-text tracking-tight uppercase">Nuevo Live</h3>
          <button onClick={onClose} className="p-2 rounded-full bg-gray-50 text-base-text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-base-text-muted uppercase tracking-wider ml-1">Título del Live</label>
            <input 
              type="text" placeholder="Título del Live" 
              className="input-modern"
              value={title} onChange={e => setTitle(e.target.value)} required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-base-text-muted uppercase tracking-wider ml-1">Fecha y Hora</label>
            <input 
              type="datetime-local" 
              className="input-modern"
              value={date} onChange={e => setDate(e.target.value)} required
            />
          </div>
          <button type="submit" className="w-full btn-pill-primary py-4 mt-4">Programar</button>
        </form>
      </motion.div>
    </div>
  );
}

const MinusCircle = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/>
  </svg>
);

function PeopleModal({ people, onClose, onSelectPerson, onLinkNumber }: any) {
  const [search, setSearch] = useState('');

  const filteredPeople = people.filter((p: any) => 
    p.nombre.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="relative w-full max-w-lg bg-white rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-brand/10 flex items-center justify-center text-brand">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-base-text tracking-tight uppercase">Personas</h3>
              <p className="text-[10px] font-bold text-base-text-muted uppercase tracking-wider">{people.length} Registradas</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-base-text-muted" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 bg-gray-50/50">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar persona..." 
              className="w-full pl-11 pr-4 py-3 bg-white border border-gray-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredPeople.length === 0 ? (
            <div className="text-center py-12 opacity-20">
              <Users className="w-12 h-12 mx-auto mb-3" />
              <p className="text-xs font-bold uppercase tracking-widest">No se encontraron personas</p>
            </div>
          ) : (
            filteredPeople.map((person: any, idx: number) => (
              <div 
                key={`${person.id || person.nombre}-${idx}`}
                onClick={() => onSelectPerson(person.id)}
                className="w-full card-modern p-4 flex items-center justify-between hover:bg-gray-50 transition-colors group cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500 font-bold text-xs">
                    {person.nombre.charAt(0).toUpperCase()}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-base-text uppercase tracking-tight truncate max-w-[150px]">{getVisualName(person.nombre)}</p>
                    <div className="flex items-center gap-2 text-[9px] font-bold text-base-text-muted uppercase tracking-wider">
                      {person.phone && <span className="text-emerald-600">{person.phone} • </span>}
                      <span>{person.count} {person.count === 1 ? 'Pago' : 'Pagos'}</span>
                      <span>•</span>
                      <span>Último: {formatAppDate(person.lastDate)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-base font-extrabold text-brand leading-none">Bs {person.total}</p>
                    <ChevronRight className="w-4 h-4 text-gray-300 ml-auto mt-1 group-hover:translate-x-1 transition-transform" />
                  </div>
                  {!person.phone && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onLinkNumber({
                          id: person.customerId,
                          name: person.nombre
                        });
                      }}
                      className="p-2 bg-gray-100 rounded-full text-gray-400 hover:text-brand transition-colors"
                      title="Vincular WhatsApp"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </div>
  );
}

interface OrderItemCardProps {
  amount: number;
  status: string;
  quantity?: number;
  bags?: number;
  tag?: string;
  isOnlyPayment?: boolean;
  onClick?: () => void;
  onStatusClick?: (e: React.MouseEvent) => void;
}

const OrderItemCard: React.FC<OrderItemCardProps> = ({
  amount = 350,
  status = 'VERIFICADO',
  quantity = 5,
  bags = 1,
  tag = '',
  isOnlyPayment = false,
  onClick,
  onStatusClick
}) => {
  const s = status.toUpperCase();
  const isProcesar = s === 'PROCESAR' || s === 'VERIFICADO' || s === 'PENDING';
  const isListo = s === 'LISTO' || s === 'PREPARADO' || s === 'READY';
  const isPago = s === 'PAGO' || isOnlyPayment;
  
  // Softer, more pastel palette
  const colors = isPago
    ? {
        main: '#64748b', // Slate
        bg: '#f8fafc',   // Slate 50
        border: '#f1f5f9', // Slate 100
        btnBorder: '#e2e8f0'
      }
    : isProcesar 
    ? { 
        main: '#92400E', // Muted Amber
        bg: '#FFFBEB',   // Very light Amber
        border: '#FEF3C7', // Soft Amber border
        btnBorder: '#FDE68A' 
      } 
    : isListo 
    ? { 
        main: '#1E40AF', // Muted Blue (not "chillón")
        bg: '#F0F7FF',   // Very light Blue
        border: '#E0F2FE', // Soft Blue border
        btnBorder: '#BAE6FD'
      } 
    : { 
        main: '#065F46', // Muted Green
        bg: '#F0FDF4',   // Very light Green
        border: '#DCFCE7', // Soft Green border
        btnBorder: '#BBF7D0'
      };

  const getStatusText = () => {
    if (isPago) return 'PAGO';
    if (isProcesar) return 'PROCESAR';
    if (isListo) return 'PREPARADO';
    return 'ENTREGADO';
  };

  // Neutral slate for secondary data that blends better
  const secondaryColor = '#64748b';

  return (
    <motion.div 
      whileTap={{ scale: 0.98 }}
      className="order-card-container"
      onClick={onClick}
      style={{ 
        padding: '12px', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '12px',
        backgroundColor: '#ffffff',
        borderColor: colors.border,
        borderWidth: '1.5px',
        borderStyle: 'solid',
        borderRadius: '28px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
        marginBottom: '12px'
      }}
    >
      {/* Icono Principal */}
      <div style={{ 
        width: '48px', 
        height: '48px', 
        borderRadius: '14px', 
        backgroundColor: colors.bg, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        color: colors.main,
        flexShrink: 0
      }}>
        {isPago ? <Wallet size={22} /> : <ShoppingBag size={22} />}
      </div>

      {/* Grupo de Datos */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: secondaryColor }}>
        {!isPago && quantity !== undefined && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Shirt size={15} />
            <span style={{ fontSize: '10px', fontWeight: 800, marginTop: '1px' }}>{quantity}</span>
          </div>
        )}
        {!isPago && bags !== undefined && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <ShoppingBag size={15} />
            <span style={{ fontSize: '10px', fontWeight: 800, marginTop: '1px' }}>{bags}</span>
          </div>
        )}
        {!isPago && tag && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Tag size={15} />
            <span style={{ fontSize: '10px', fontWeight: 800, marginTop: '1px' }}>{tag}</span>
          </div>
        )}
        {isPago && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Historial</span>
            <span style={{ fontSize: '8px', fontWeight: 600, opacity: 0.6 }}>Solo pagos registrados</span>
          </div>
        )}
      </div>

      {/* Monto */}
      <div style={{ marginLeft: 'auto', textAlign: 'right', paddingRight: '4px' }}>
        <span style={{ fontSize: '15px', fontWeight: 800, color: secondaryColor }}>
          Bs {amount}
        </span>
      </div>

      {/* Botón de Estado */}
      <button 
        onClick={(e) => {
          if (onStatusClick && !isPago) {
            e.stopPropagation();
            onStatusClick(e);
          }
        }}
        style={{ 
          padding: '8px 16px', 
          borderRadius: '999px', 
          backgroundColor: colors.bg, 
          border: `1.5px solid ${colors.btnBorder}`,
          color: colors.main,
          fontSize: '11px',
          fontWeight: 800,
          cursor: isPago ? 'default' : 'pointer',
          transition: 'all 0.2s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: '100px',
          letterSpacing: '0.02em',
          opacity: isPago ? 0.7 : 1
        }}
      >
        {getStatusText()}
      </button>
    </motion.div>
  );
};

function PersonDetailModal({ person, pedidos: allPedidos, customers, onClose, onEditPayment, onLinkNumber, forceDetailView, onRefresh }: any) {
  const loadData = onRefresh ?? (() => Promise.resolve());
  const [quickPhone, setQuickPhone] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [showQuickLink, setShowQuickLink] = useState(false);

  const handleQuickLink = async () => {
    if (!quickPhone) return;
    setIsLinking(true);
    try {
      const phoneToSave = quickPhone.startsWith('+') ? quickPhone : `+591${quickPhone}`;
      if (person.customerId) {
        await updateDoc(doc(db, 'customers', person.customerId), { phone: phoneToSave });
      } else {
        const cleanedName = cleanName(person.nombre);
        await addDoc(collection(db, 'customers'), {
          name: person.nombre.toUpperCase(),
          canonicalName: cleanedName,
          phone: phoneToSave,
          createdAt: serverTimestamp(),
          totalPaid: 0
        });
      }
      setShowQuickLink(false);
      setQuickPhone('');
    } catch (error) {
      console.error("Error linking phone:", error);
    } finally {
      setIsLinking(false);
    }
  };

  const dailyOrders = useMemo(() => {
    const groups: { [key: string]: any } = {};
    
    const pedidos = person.pedidos || [];
    const legacyOrders = person.orders || [];
    const payments = person.payments || [];

    const allWork = [...pedidos, ...legacyOrders];

    allWork.forEach((ped: any) => {
      const pDate = parseAppDate(ped.date);
      const dateKey = pDate ? pDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase() : 'SIN FECHA';
      
      if (!groups[dateKey]) {
        groups[dateKey] = {
          dateKey,
          rawDate: pDate || new Date(0),
          orderAmount: 0,
          paymentAmount: 0,
          quantity: 0,
          bags: 0,
          tags: new Set(),
          status: 'PROCESAR',
          pedido: ped,
          orderIds: [],
          paymentCount: 0,
          paymentsList: []
        };
      }

      groups[dateKey].orderAmount += cleanAmount(ped.totalAmount);
      groups[dateKey].quantity += ped.itemCount || 0;
      groups[dateKey].bags += ped.bagCount || 0;
      groups[dateKey].orderIds.push(ped.id);
      if (ped.label) groups[dateKey].tags.add(ped.label);
      
      if (ped.status) {
        const s = ped.status.toUpperCase();
        if (s === 'LISTO' || s === 'PREPARADO' || s === 'READY' || s === 'ENTREGADO') {
          groups[dateKey].status = s;
        }
      }
    });

    payments.forEach((p: any) => {
      const pDate = parseAppDate(p.date);
      const dateKey = pDate ? pDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase() : 'SIN FECHA';
      
      if (!groups[dateKey]) {
        groups[dateKey] = {
          dateKey,
          rawDate: pDate || new Date(0),
          orderAmount: 0,
          paymentAmount: 0,
          quantity: 0,
          bags: 0,
          tags: new Set(),
          status: 'PAGO', // Mark as PAGO if no order exists yet
          pedido: null,
          orderIds: [],
          paymentCount: 0,
          paymentsList: [],
          isOnlyPayment: true
        };
      }

      groups[dateKey].paymentAmount += cleanAmount(p.pago);
      groups[dateKey].paymentCount += 1;
      groups[dateKey].paymentsList.push({
        id: p.id,
        date: pDate,
        amount: cleanAmount(p.pago),
        method: p.method || ''
      });
    });

    // Ordenar pagos de cada grupo por hora
    Object.values(groups).forEach((g: any) => {
      g.paymentsList.sort((a: any, b: any) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));
    });

    // Final pass to mark groups that have real orders
    Object.values(groups).forEach((g: any) => {
      if (g.orderIds.length > 0) {
        g.isOnlyPayment = false;
      }
    });

    return Object.values(groups).sort((a: any, b: any) => b.rawDate.getTime() - a.rawDate.getTime());
  }, [person.pedidos, person.payments]);

  // Smart Navigation Logic: Find the most urgent order (PROCESAR)
  const initialOrder = useMemo(() => {
    // Priority: Find the first group that has a REAL order and is in 'PROCESAR' status
    const urgentGroup = dailyOrders.find(g => !g.isOnlyPayment && g.status === 'PROCESAR');
    if (urgentGroup && urgentGroup.pedido) {
      return {
        view: 'verify' as const,
        selectedPedido: {
          ...urgentGroup.pedido,
          orderAmount: urgentGroup.orderAmount,
          paymentAmount: urgentGroup.paymentAmount,
          paymentCount: urgentGroup.paymentCount
        }
      };
    }
    return { view: 'detail' as const, selectedPedido: null };
  }, [dailyOrders]);

  const [view, setView] = useState<'detail' | 'verify'>(forceDetailView ? 'verify' : initialOrder.view);
  const [selectedPedido, setSelectedPedido] = useState<any>(forceDetailView ? initialOrder.selectedPedido : initialOrder.selectedPedido);
  const [showAddPedido, setShowAddPedido] = useState(false);
  const [expandedPayments, setExpandedPayments] = useState<string[]>([]);
  // Para PROCESAR: empieza en 0 (el operador cuenta desde cero).
  // Para LISTO: empieza en el valor guardado (modo edición).
  const _initStatus = (initialOrder.selectedPedido?.status ?? '').toUpperCase();
  const _isEditing = _initStatus === 'LISTO' || _initStatus === 'PREPARADO' || _initStatus === 'READY';
  const [selectedPrenda, setSelectedPrenda] = useState(_isEditing ? (initialOrder.selectedPedido?.itemCount || 0) : 0);
  const [bolsaCount, setBolsaCount] = useState(_isEditing ? (initialOrder.selectedPedido?.bagCount || 0) : 0);
  const [confirmDeletePedido, setConfirmDeletePedido] = useState<string | null>(null);
  const [confirmDeleteProfile, setConfirmDeleteProfile] = useState(false);
  const [confirmDelivery, setConfirmDelivery] = useState<{ ids: string[], status: string } | null>(null);

  const togglePaymentGroup = (dateKey: string) => {
    setExpandedPayments(prev => 
      prev.includes(dateKey) ? prev.filter(d => d !== dateKey) : [...prev, dateKey]
    );
  };

  const dayPayments = useMemo(() => {
    if (!selectedPedido) return [];
    const pDate = parseAppDate(selectedPedido.date);
    if (!pDate) return [];
    const dateKey = pDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
    
    return (person.payments || [])
      .filter((p: any) => {
        const pd = parseAppDate(p.date);
        return pd && pd.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase() === dateKey;
      })
      .map((p: any) => ({
        id: p.id,
        time: p.date,
        amount: p.pago
      }));
  }, [person.payments, selectedPedido]);

  const stats = useMemo(() => {
    const payments = person.payments || [];
    const totalPayments = payments.reduce((acc: number, p: any) => acc + cleanAmount(p.pago), 0);
    const totalOrders = (person.pedidos || []).reduce((acc: number, p: any) => acc + cleanAmount(p.totalAmount), 0);
    const paymentCount = payments.length;
    const orderCount = (person.pedidos || []).length; // Count only real orders
    return { totalPayments, totalOrders, paymentCount, orderCount };
  }, [person.payments, person.pedidos, dailyOrders]);

  const handleUpdateStatus = async (pedidoId: string, currentStatus: string) => {
    const nextStatusMap: { [key: string]: string } = {
      'PROCESAR': 'listo',
      'VERIFICADO': 'listo',
      'PENDING': 'listo',
      'LISTO': 'entregado',
      'PREPARADO': 'entregado',
      'READY': 'entregado',
      'ENTREGADO': 'procesar'
    };
    
    const nextStatus = nextStatusMap[currentStatus.toUpperCase()] || 'procesar';
    
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'pedidos', pedidoId), { status: nextStatus.toLowerCase() });

      const updatedPedidos = allPedidos.map(p =>
        p.id === pedidoId ? { ...p, status: nextStatus.toLowerCase() } : p
      );

      await batch.commit();
      await syncLabelsForCustomer(person.customerId, updatedPedidos, customers);
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleSmartAction = async () => {
    if (!selectedPedido || isSaving) return;
    const status = selectedPedido.status.toUpperCase();
    const isProcesar = status === 'PROCESAR' || status === 'VERIFICADO' || status === 'PENDING';
    const isListo = status === 'LISTO' || status === 'PREPARADO' || status === 'READY';

    if (selectedPedido.id.startsWith('temp-')) { setView('detail'); setSelectedPedido(null); return; }
    if (bolsaCount === 0) { alert('Debes registrar al menos 1 bolsa antes de marcar el pedido como listo.'); setIsSaving(false); return; }

    setIsSaving(true);
    if (isProcesar) {
      // PROCESAR → LISTO: regresar al perfil inmediatamente (actualización optimista)
      setView('detail');
      setSelectedPedido(null);
      try {
        await pedidosApi.update(selectedPedido.id, { status: 'listo', bag_count: bolsaCount, item_count: selectedPrenda });
        const updatedPedidos = allPedidos.map((p: any) =>
          p.id === selectedPedido.id ? { ...p, status: 'listo', bagCount: bolsaCount, itemCount: selectedPrenda } : p
        );
        if (person.customerId) {
          await syncLabelsForCustomer(person.customerId, updatedPedidos, customers);
        }
        loadData();
      } catch (error) {
        console.error('Error al marcar pedido listo:', error);
        loadData();
      }
    } else if (isListo) {
      // LISTO → guardar cambios de prendas/bolsas (edición)
      try {
        await pedidosApi.update(selectedPedido.id, { bag_count: bolsaCount, item_count: selectedPrenda });
        setView('detail');
        setSelectedPedido(null);
        loadData();
      } catch (error) {
        console.error('Error al guardar cambios:', error);
      }
    }
    setIsSaving(false);
  };

  const getSmartButtonText = () => {
    if (!selectedPedido) return '';
    const status = selectedPedido.status.toUpperCase();
    if (status === 'PROCESAR' || status === 'VERIFICADO' || status === 'PENDING') return 'MARCAR COMO LISTO';
    if (status === 'LISTO' || status === 'PREPARADO' || status === 'READY') return 'GUARDAR CAMBIOS';
    return 'PEDIDO ENTREGADO';
  };

  const handleDeletePedido = async (pedidoId: string) => {
    setConfirmDeletePedido(pedidoId);
  };

  const executeDeletePedido = async () => {
    if (!confirmDeletePedido) return;
    try {
      try { await releasePedidoLabel(confirmDeletePedido, 'DELETED'); } catch (e) { /* sin etiqueta asignada */ }
      await pedidosApi.delete(confirmDeletePedido);
      const updatedPedidos = allPedidos.filter(p => p.id !== confirmDeletePedido);
      await syncLabelsForCustomer(person.customerId, updatedPedidos, customers);
      await loadData();
      if (forceDetailView) { onClose(); } else { setView('detail'); setSelectedPedido(null); }
    } catch (error) {
      console.error('Error deleting pedido:', error);
    } finally {
      setConfirmDeletePedido(null);
    }
  };

  const handleDeleteProfile = async () => {
    try {
      const batch = writeBatch(db);
      
      // Delete all payments
      person.payments.forEach((p: any) => {
        batch.delete(doc(db, 'pagos', p.id));
      });
      
      // Delete all pedidos
      person.pedidos.forEach((p: any) => {
        batch.delete(doc(db, 'pedidos', p.id));
      });
      
      // Delete all orders
      if (person.orders) {
        person.orders.forEach((o: any) => {
          batch.delete(doc(db, 'orders', o.id));
        });
      }
      
      // Delete customer profile
      if (person.customerId) {
        batch.delete(doc(db, 'customers', person.customerId));
      }
      
      await batch.commit();
      onClose();
    } catch (error) {
      console.error('Error deleting profile:', error);
    } finally {
      setConfirmDeleteProfile(false);
    }
  };

  const handleStatusTransition = async (orderIds: string[], currentStatus: string, pedido?: any) => {
    const status = currentStatus.toUpperCase();
    // PROCESAR → abrir Mesa de Preparación
    if (status === 'PROCESAR' || status === 'VERIFICADO' || status === 'PENDING') {
      if (pedido) {
        setSelectedPedido({ ...pedido, orderIds });
        const isEditing = false;
        setBolsaCount(isEditing ? (pedido.bagCount || 0) : 0);
        setSelectedPrenda(isEditing ? (pedido.itemCount || 0) : 0);
        setView('verify');
      }
      return;
    }
    // LISTO → mostrar confirmación de entrega
    if (status === 'LISTO' || status === 'PREPARADO' || status === 'READY') {
      setConfirmDelivery({ ids: orderIds, status: currentStatus });
      return;
    }
    // ENTREGADO → no hacer nada desde el perfil
    if (status === 'ENTREGADO') return;
  };

  const executeDelivery = async () => {
    if (!confirmDelivery) return;
    const { ids } = confirmDelivery;
    try {
      // Actualizar todos los pedidos del grupo a "entregado"
      await Promise.all(
        ids.filter(id => !id.startsWith('temp-')).map(id =>
          pedidosApi.update(id, { status: 'entregado' })
        )
      );
      const updatedPedidos = allPedidos.map(p =>
        ids.includes(p.id) ? { ...p, status: 'entregado' } : p
      );
      if (person.customerId) {
        await syncLabelsForCustomer(person.customerId, updatedPedidos, customers);
      }
      await loadData();
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#2E7D32', '#E8F5E9', '#10B981'] });
    } catch (error) {
      console.error('Error delivering order:', error);
      alert('Error al confirmar la entrega');
    } finally {
      setConfirmDelivery(null);
    }
  };

  const getStatusText = (s: string) => {
    const status = s.toUpperCase();
    if (status === 'PROCESAR' || status === 'VERIFICADO' || status === 'PENDING') return 'PROCESAR';
    if (status === 'LISTO' || status === 'PREPARADO' || status === 'READY') return 'LISTO';
    return 'ENTREGADO';
  };

  const getBadgeClass = (s: string) => {
    const status = s.toUpperCase();
    if (status === 'PROCESAR' || status === 'VERIFICADO' || status === 'PENDING') return 'badge-verificado';
    if (status === 'LISTO' || status === 'PREPARADO' || status === 'READY') return 'badge-preparado';
    return 'badge-entregado';
  };

  if (view === 'verify' && selectedPedido) {
    return (
      <motion.div 
        initial={{ opacity: 0, x: '100%' }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: '100%' }}
        transition={{ duration: 0.15, ease: "linear" }}
        className="absolute inset-0 z-[120] bg-white flex flex-col no-scrollbar"
      >
        <div className="clone-header-container">
          <div className="flex items-start gap-3">
            <button onClick={() => forceDetailView ? onClose() : setView('detail')} className="p-2 text-gray-400 hover:bg-gray-50 rounded-full transition-colors">
              <ChevronLeft size={24} />
            </button>
            <div className="flex-1">
              <p className="text-[10px] font-black text-brand tracking-widest uppercase mb-1">
                DETALLE DEL PEDIDO
              </p>
              <h1 className="clone-name-title leading-tight">{getVisualName(person.nombre)}</h1>
              <div className="mt-1">
                {person.phone ? (
                  <a 
                    href={`https://wa.me/${person.phone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand font-black text-[18px] tracking-tight hover:underline flex items-center"
                  >
                    {person.phone.replace('+591', '').trim()}
                  </a>
                ) : (
                  <div className="flex flex-col gap-2">
                    {showQuickLink ? (
                      <div className="flex items-center gap-2">
                        <input 
                          autoFocus
                          type="tel"
                          placeholder="Número..."
                          value={quickPhone}
                          onChange={(e) => setQuickPhone(e.target.value)}
                          className="w-32 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1 text-xs font-bold focus:outline-none focus:border-brand"
                          onKeyDown={(e) => e.key === 'Enter' && handleQuickLink()}
                        />
                        <button 
                          onClick={handleQuickLink}
                          disabled={isLinking}
                          className="bg-brand text-white px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                        >
                          {isLinking ? '...' : 'OK'}
                        </button>
                      </div>
                    ) : (
                      <div 
                        onClick={() => setShowQuickLink(true)}
                        className="flex items-center text-gray-400 text-[11px] font-bold uppercase tracking-wider cursor-pointer hover:text-brand transition-colors"
                      >
                        SIN VINCULAR
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            {!selectedPedido.id.startsWith('temp-') && (
              <button 
                onClick={() => handleDeletePedido(selectedPedido.id)}
                className="p-2 text-rose-300 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all"
                title="Eliminar Pedido"
              >
                <Trash2 size={20} />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-5 pt-5 flex flex-col gap-6 pb-10">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#FFF1F2] rounded-[20px] p-4 border border-[#FFE4E6] flex flex-col justify-center">
              <span className="text-[8px] font-bold text-[#BE185D] uppercase tracking-widest block mb-1">Total del Pedido</span>
              <span className="text-xl font-black text-[#BE185D]">Bs {selectedPedido.orderAmount || selectedPedido.totalAmount || 0}</span>
            </div>
            <div className="order-card-bg p-4 flex flex-col justify-center">
              <span className="text-[8px] font-bold text-[#94A3B8] uppercase tracking-widest block mb-1">Pagos Realizados</span>
              <span className="text-xl font-black text-[#1E293B]">{selectedPedido.paymentCount || 0}</span>
            </div>
          </div>

          <div>
            <PaymentHistoryTape 
              payments={dayPayments} 
              onPaymentClick={(p) => console.log(`Pago de Bs ${p.amount}`)} 
            />
          </div>

          <div className="clone-kit-container">
            {/* Botón de Reseteo Maestro */}
            <button 
              onClick={() => {
                setSelectedPrenda(0);
                setBolsaCount(0);
              }} 
              className="reset-button"
            >
              <p className="reset-text">Resumen del Pedido</p>
            </button>
            
            <div className="icons-grid">
              {/* Prenda */}
              <button 
                onClick={() => setSelectedPrenda(prev => prev + 1)}
                className="icon-unit"
              >
                <motion.div 
                  whileTap={{ scale: 0.9 }}
                  className="icon-box"
                >
                  <Shirt size={28} />
                </motion.div>
                <p className="unit-label">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={selectedPrenda}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      transition={{ duration: 0.1 }}
                    >
                      {selectedPrenda}
                    </motion.span>
                  </AnimatePresence>
                  <span className="ml-1">Prendas</span>
                </p>
              </button>
              
              <div className="divider" />
              
              {/* Bolsa */}
              <button 
                onClick={() => setBolsaCount(prev => prev + 1)}
                className="icon-unit"
              >
                <motion.div 
                  whileTap={{ scale: 0.9 }}
                  className="icon-box"
                >
                  <ShoppingBag size={28} />
                </motion.div>
                <p className="unit-label">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={bolsaCount}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      transition={{ duration: 0.1 }}
                    >
                      {bolsaCount}
                    </motion.span>
                  </AnimatePresence>
                  <span className="ml-1">Bolsa{bolsaCount !== 1 ? 's' : ''}</span>
                </p>
              </button>

              <div className="divider" />

              {/* Etiqueta (Bloqueada) */}
              <div className="icon-unit opacity-80 cursor-not-allowed">
                <motion.div 
                  whileTap={{ scale: 0.95 }}
                  className="icon-box bg-gray-50 border-gray-100"
                >
                  <Tag size={28} className="text-gray-400" />
                </motion.div>
                <p className="unit-label text-gray-400">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={selectedPedido.label || 'A'}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      transition={{ duration: 0.1 }}
                    >
                      {selectedPedido.label || 'A'}
                    </motion.span>
                  </AnimatePresence>
                </p>
              </div>
            </div>
          </div>

          {(() => {
            const st = selectedPedido.status.toUpperCase();
            const isProcesar = st === 'PROCESAR' || st === 'VERIFICADO' || st === 'PENDING';
            const isListo = st === 'LISTO' || st === 'PREPARADO' || st === 'READY';
            if (!isProcesar && !isListo) return null;
            return (
              <button
                onClick={handleSmartAction}
                disabled={isSaving}
                className={cn(
                  "w-full py-5 rounded-[24px] font-black uppercase tracking-[0.1em] flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg text-[14px] disabled:opacity-60",
                  isProcesar ? "bg-[#FFF9C4] text-[#F57F17] shadow-[#FFF9C4]/20" : "bg-[#E3F2FD] text-[#1976D2] shadow-[#E3F2FD]/20"
                )}
              >
                <span>{isSaving ? '...' : getSmartButtonText()}</span>
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center border-2",
                  isProcesar ? "border-[#F57F17]/30" : "border-[#1976D2]/30"
                )}>
                  <Check size={16} strokeWidth={4} />
                </div>
              </button>
            );
          })()}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, x: '100%' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: '100%' }}
      transition={{ duration: 0.15, ease: "linear" }}
      className="absolute inset-0 z-[120] bg-white flex flex-col no-scrollbar"
    >
      <div className="clone-header-container">
        <div className="flex items-start gap-3">
          <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-50 rounded-full transition-colors">
            <ChevronLeft size={24} />
          </button>
          <div className="flex-1">
            <p className="text-[10px] font-black text-brand tracking-widest uppercase mb-1">
              PERFIL DE CLIENTE
            </p>
            <h1 className="clone-name-title leading-tight">{getVisualName(person.nombre)}</h1>
            <div className="mt-1">
              {person.phone ? (
                <a 
                  href={`https://wa.me/${person.phone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand font-black text-[18px] tracking-tight hover:underline flex items-center"
                >
                  {person.phone.replace('+591', '').trim()}
                </a>
              ) : (
                <div className="flex flex-col gap-2">
                  {showQuickLink ? (
                    <div className="flex items-center gap-2">
                      <input 
                        autoFocus
                        type="tel"
                        placeholder="Número..."
                        value={quickPhone}
                        onChange={(e) => setQuickPhone(e.target.value)}
                        className="w-32 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1 text-xs font-bold focus:outline-none focus:border-brand"
                        onKeyDown={(e) => e.key === 'Enter' && handleQuickLink()}
                      />
                      <button 
                        onClick={handleQuickLink}
                        disabled={isLinking}
                        className="bg-brand text-white px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                      >
                        {isLinking ? '...' : 'OK'}
                      </button>
                    </div>
                  ) : (
                    <div 
                      onClick={() => setShowQuickLink(true)}
                      className="flex items-center text-gray-400 text-[11px] font-bold uppercase tracking-wider cursor-pointer hover:text-brand transition-colors"
                    >
                      SIN VINCULAR
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <button 
            onClick={() => setConfirmDeleteProfile(true)}
            className="p-2 text-rose-300 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all"
            title="Eliminar Perfil Completo"
          >
            <Trash2 size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-5 pt-5">
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-[#FFF1F2] rounded-[20px] p-4 border border-[#FFE4E6] flex flex-col justify-center">
            <span className="text-[8px] font-bold text-[#BE185D] uppercase tracking-widest block mb-1">Total Acumulado</span>
            <span className="text-xl font-black text-[#BE185D]">Bs {stats.totalPayments}</span>
          </div>
          <div className="bg-emerald-50 rounded-[20px] p-4 border border-emerald-100 flex flex-col justify-center">
            <span className="text-[8px] font-bold text-emerald-600 uppercase tracking-widest block mb-1">Total Pedidos</span>
            <span className="text-xl font-black text-emerald-700">{stats.orderCount}</span>
          </div>
        </div>

        <div className="space-y-8 pb-24">
          {dailyOrders.length === 0 ? (
            <div className="text-center py-12 opacity-20">
              <History className="w-12 h-12 mx-auto mb-3" />
              <p className="text-xs font-bold uppercase tracking-widest">Sin historial</p>
            </div>
          ) : (
            dailyOrders.map((order: any, idx: number) => {
              const isExpanded = expandedPayments.includes(order.dateKey);
              const hasPayments = (order.paymentsList?.length ?? 0) > 0;
              return (
              <div key={`${order.dateKey}-${idx}`}>
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-[10px] font-black text-brand uppercase tracking-[0.15em]">PEDIDO - {order.dateKey}</h3>
                  <div className="h-[1px] flex-1 bg-brand/10" />
                </div>
                <OrderItemCard
                  amount={order.orderAmount || order.paymentAmount}
                  status={order.status}
                  quantity={order.quantity ?? 0}
                  bags={order.bags ?? 0}
                  tag={Array.from(order.tags).join(', ') || ''}
                  isOnlyPayment={order.isOnlyPayment}
                  onStatusClick={() => !order.isOnlyPayment && handleStatusTransition(order.orderIds, order.status, order.pedido)}
                  onClick={() => {
                    if (order.isOnlyPayment) {
                      return;
                    }
                    const pedidoData = order.pedido;
                    if (!pedidoData) return;

                    setSelectedPedido({
                      ...pedidoData,
                      orderAmount: order.orderAmount,
                      paymentAmount: order.paymentAmount,
                      paymentCount: order.paymentCount
                    });
                    const isEditingListo = (pedidoData.status ?? '').toUpperCase() === 'LISTO' || (pedidoData.status ?? '').toUpperCase() === 'PREPARADO' || (pedidoData.status ?? '').toUpperCase() === 'READY';
                    setBolsaCount(isEditingListo ? (pedidoData.bagCount || 0) : 0);
                    setSelectedPrenda(isEditingListo ? (pedidoData.itemCount || 0) : 0);
                    setView('verify');
                  }}
                />
                {hasPayments && (
                  <div className="mt-[-4px] mb-3 px-1">
                    <button
                      onClick={() => togglePaymentGroup(order.dateKey)}
                      className="w-full flex items-center justify-between px-4 py-2 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-2 text-slate-600">
                        <Wallet size={14} />
                        <span className="text-[10px] font-black uppercase tracking-widest">
                          {order.paymentCount} {order.paymentCount === 1 ? 'pago' : 'pagos'} · Bs {order.paymentAmount}
                        </span>
                      </div>
                      <ChevronDown
                        size={14}
                        className="text-slate-400 transition-transform"
                        style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                      />
                    </button>
                    {isExpanded && (
                      <div className="mt-2 space-y-1 pl-2">
                        {order.paymentsList.map((p: any, i: number) => {
                          const hh = p.date ? String(p.date.getHours()).padStart(2, '0') : '--';
                          const mm = p.date ? String(p.date.getMinutes()).padStart(2, '0') : '--';
                          return (
                            <div key={`${p.id}-${i}`} className="flex items-center justify-between px-3 py-2 rounded-xl bg-white border border-slate-100">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-slate-500 tabular-nums">{hh}:{mm}</span>
                                {p.method && (
                                  <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">{p.method}</span>
                                )}
                              </div>
                              <span className="text-[11px] font-black text-[#BE185D]">Bs {p.amount}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
              );
            })
          )}
        </div>
      </div>

      <AnimatePresence>
        {showAddPedido && (
          <AddPedidoModal 
            onClose={() => setShowAddPedido(false)} 
            customerId={person.customerId}
            customerName={person.nombre}
            allPedidos={allPedidos}
            allCustomers={customers}
            paymentCount={0}
          />
        )}
      </AnimatePresence>

      <ConfirmModal 
        isOpen={!!confirmDeletePedido}
        onClose={() => setConfirmDeletePedido(null)}
        onConfirm={executeDeletePedido}
        title="Eliminar Pedido"
        message="¿Estás seguro de que deseas eliminar este pedido permanentemente?"
      />

      <ConfirmModal 
        isOpen={confirmDeleteProfile}
        onClose={() => setConfirmDeleteProfile(false)}
        onConfirm={handleDeleteProfile}
        title="Eliminar Perfil Completo"
        message={`¿Estás seguro de que deseas eliminar permanentemente a ${person.nombre} y TODOS sus datos (pagos y pedidos)? Esta acción no se puede deshacer.`}
      />

      <ConfirmModal 
        isOpen={!!confirmDelivery}
        onClose={() => setConfirmDelivery(null)}
        onConfirm={executeDelivery}
        title="Confirmar Entrega"
        message="¿Seguro que entregaste el pedido?"
        confirmText="Sí, Entregado"
        cancelText="No, aún no"
        isDanger={false}
      />
    </motion.div>
  );
}
function SwipeableItem({ children, onDelete, onEdit }: any) {
  const [isSwiped, setIsSwiped] = useState(false);
  
  return (
    <div className="relative overflow-hidden rounded-[24px]">
      {/* Actions Background */}
      <div className="absolute inset-0 flex justify-end items-center px-4 gap-2 bg-gray-50">
        <button 
          onClick={(e) => { e.stopPropagation(); onEdit(); setIsSwiped(false); }}
          className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center text-brand hover:scale-110 transition-transform"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(); setIsSwiped(false); }}
          className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-500 hover:scale-110 transition-transform"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      
      {/* Content */}
      <motion.div
        drag="x"
        dragConstraints={{ left: -120, right: 0 }}
        dragElastic={0.1}
        onDragEnd={(_, info) => {
          if (info.offset.x < -40) {
            setIsSwiped(true);
          } else {
            setIsSwiped(false);
          }
        }}
        animate={{ x: isSwiped ? -120 : 0 }}
        className="relative z-10 cursor-grab active:cursor-grabbing"
      >
        {children}
      </motion.div>
    </div>
  );
}

function CalendarModal({ 
  selectedDate, 
  onSelect, 
  onClose,
  isAutomatic,
  setIsAutomatic,
  recurrence,
  setShowRecurrencePicker
}: { 
  selectedDate: Date, 
  onSelect: (d: Date) => void, 
  onClose: () => void,
  isAutomatic: boolean,
  setIsAutomatic: (v: boolean) => void,
  recurrence: string,
  setShowRecurrencePicker: (v: boolean) => void
}) {
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(selectedDate));
  const [tempSelectedDate, setTempSelectedDate] = useState(selectedDate);
  
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const handleConfirm = () => {
    onSelect(tempSelectedDate);
  };

  const handleToday = () => {
    const now = new Date();
    setTempSelectedDate(now);
    setCurrentMonth(startOfMonth(now));
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[130] flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div 
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        exit={{ y: 100 }}
        className="bg-white w-full max-w-md rounded-[2.5rem] overflow-hidden shadow-2xl border border-gray-50 p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-base-text">Fecha</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X size={20} className="text-base-text-muted" />
          </button>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center justify-between bg-gray-50 rounded-2xl p-2">
          <button onClick={prevMonth} className="p-2 hover:bg-white hover:shadow-sm rounded-xl transition-all text-gray-400">
            <ChevronLeft size={20} />
          </button>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-base-text">
            {format(currentMonth, "MMMM 'de' yyyy", { locale: es })}
          </span>
          <button onClick={nextMonth} className="p-2 hover:bg-white hover:shadow-sm rounded-xl transition-all text-gray-400">
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Day Headers */}
        <div className="grid grid-cols-7">
          {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d, i) => (
            <div key={`header-${i}`} className="text-center text-[10px] font-bold text-gray-300 py-2">
              {d}
            </div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-y-1">
          {days.map((day) => {
            const isSelected = isSameDay(day, tempSelectedDate);
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isToday = isSameDay(day, new Date());
            
            return (
              <button
                key={day.getTime()}
                onClick={() => setTempSelectedDate(day)}
                className={cn(
                  "relative h-10 w-10 mx-auto flex items-center justify-center rounded-full text-xs font-bold transition-all",
                  !isCurrentMonth && "text-gray-200",
                  isCurrentMonth && !isSelected && "text-base-text hover:bg-gray-50",
                  isSelected && "bg-brand text-white shadow-lg shadow-brand/10 scale-110"
                )}
              >
                {format(day, 'd')}
                {isSelected && (
                  <div className="absolute bottom-1 w-1 h-1 bg-white rounded-full" />
                )}
                {isToday && !isSelected && (
                  <div className="absolute bottom-1 w-1 h-1 bg-brand rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* Extra Settings in Calendar */}
        <div className="flex flex-col gap-2 pt-2 border-t border-gray-50">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-2">
              <RefreshCw size={16} className="text-gray-400" />
              <span className="text-xs font-bold text-base-text">Automático</span>
            </div>
            <button 
              onClick={() => setIsAutomatic(!isAutomatic)}
              className={cn(
                "w-10 h-5 rounded-full transition-colors relative",
                isAutomatic ? "bg-emerald-500" : "bg-gray-200"
              )}
            >
              <div className={cn(
                "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                isAutomatic ? "left-6" : "left-1"
              )} />
            </button>
          </div>

          <button 
            onClick={() => setShowRecurrencePicker(true)}
            className="flex items-center justify-between p-3 bg-gray-50 rounded-xl group"
          >
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-gray-400 group-hover:text-brand transition-colors" />
              <span className="text-xs font-bold text-base-text">Repetir</span>
            </div>
            <span className="text-xs font-bold text-brand">{recurrence}</span>
          </button>
        </div>

        {/* Footer Buttons */}
        <div className="flex gap-3">
          <button 
            onClick={handleToday}
            className="flex-1 py-4 bg-gray-50 hover:bg-gray-100 text-base-text rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em] transition-colors"
          >
            Hoy
          </button>
          <button 
            onClick={handleConfirm}
            className="flex-[2] py-4 bg-brand hover:bg-brand/90 text-white rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em] transition-colors shadow-lg shadow-brand/10"
          >
            Confirmar
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function FrequencyPicker({ 
  selected, 
  onSelect, 
  onClose 
}: { 
  selected: string, 
  onSelect: (v: any) => void, 
  onClose: () => void 
}) {
  const options = [
    'Nunca',
    'Cada día',
    'Cada semana',
    'Cada 2 semanas',
    'Cada mes',
    'Cada año',
    'Personalizar'
  ];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[140] flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div 
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        exit={{ y: 100 }}
        className="bg-white w-full max-w-md rounded-[2.5rem] overflow-hidden shadow-2xl border border-gray-50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-50 flex items-center justify-between">
          <h3 className="text-xl font-bold text-base-text">Repetir</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X size={20} className="text-base-text-muted" />
          </button>
        </div>
        <div className="flex flex-col divide-y divide-gray-50">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => onSelect(opt)}
              className="flex items-center justify-between p-5 hover:bg-gray-50 transition-colors group"
            >
              <span className={cn(
                "text-sm font-medium",
                selected === opt ? "text-brand" : "text-base-text"
              )}>
                {opt}
              </span>
              {selected === opt && <Check className="w-5 h-5 text-brand" />}
              {opt === 'Personalizar' && <ChevronRight size={16} className="text-gray-300" />}
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

function StatusPicker({ 
  isPaid, 
  setIsPaid, 
  isAutomatic, 
  setIsAutomatic, 
  onClose 
}: { 
  isPaid: boolean, 
  setIsPaid: (v: boolean) => void, 
  isAutomatic: boolean, 
  setIsAutomatic: (v: boolean) => void, 
  onClose: () => void 
}) {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[140] flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div 
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        exit={{ y: 100 }}
        className="bg-white w-full max-w-md rounded-[2.5rem] overflow-hidden shadow-2xl border border-gray-50 p-6 flex flex-col gap-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-base-text">Estado</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X size={20} className="text-base-text-muted" />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {/* Paid Toggle */}
          <button 
            onClick={() => setIsPaid(!isPaid)}
            className={cn(
              "flex items-center justify-between p-5 rounded-3xl border-2 transition-all",
              isPaid ? "border-emerald-500 bg-emerald-50/50" : "border-gray-100 bg-white"
            )}
          >
            <div className="flex items-center gap-4">
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors",
                isPaid ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-400"
              )}>
                <CheckCircle2 size={24} />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-base-text">Pagado</p>
                <p className="text-[10px] font-bold text-base-text-muted uppercase tracking-wider">Ya se realizó el pago</p>
              </div>
            </div>
            {isPaid && <Check className="text-emerald-500" size={24} />}
          </button>

          {/* Pending Toggle */}
          <button 
            onClick={() => setIsPaid(!isPaid)}
            className={cn(
              "flex items-center justify-between p-5 rounded-3xl border-2 transition-all",
              !isPaid ? "border-amber-500 bg-amber-50/50" : "border-gray-100 bg-white"
            )}
          >
            <div className="flex items-center gap-4">
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors",
                !isPaid ? "bg-amber-500 text-white" : "bg-gray-100 text-gray-400"
              )}>
                <Clock size={24} />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-base-text">Pendiente</p>
                <p className="text-[10px] font-bold text-base-text-muted uppercase tracking-wider">Aún no se realiza el pago</p>
              </div>
            </div>
            {!isPaid && <Check className="text-amber-500" size={24} />}
          </button>

          {/* Automatic Processing Toggle */}
          <div className="mt-4 p-5 bg-gray-50 rounded-3xl flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-gray-400">
                <RefreshCw size={24} />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-base-text">Procesado automático</p>
                <p className="text-[10px] font-bold text-base-text-muted uppercase tracking-wider">Se registrará solo</p>
              </div>
            </div>
            <button 
              onClick={() => setIsAutomatic(!isAutomatic)}
              className={cn(
                "w-12 h-6 rounded-full transition-colors relative",
                isAutomatic ? "bg-emerald-500" : "bg-gray-200"
              )}
            >
              <div className={cn(
                "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                isAutomatic ? "left-7" : "left-1"
              )} />
            </button>
          </div>
        </div>

        <button 
          onClick={onClose}
          className="w-full py-5 bg-brand hover:bg-brand/90 text-white rounded-[2rem] text-[10px] font-bold uppercase tracking-[0.2em] transition-colors shadow-lg shadow-brand/10"
        >
          Confirmar
        </button>
      </motion.div>
    </motion.div>
  );
}

function AddPedidoModal({ onClose, customerId, customerName, allPedidos, allCustomers, paymentCount = 0 }: any) {
  const [itemCount, setItemCount] = useState('0');
  const [bagCount, setBagCount] = useState('0');
  const [label, setLabel] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [status, setStatus] = useState('procesar');
  const [showVerify, setShowVerify] = useState(false);

  useEffect(() => {
    // We don't calculate label here anymore, the engine will do it on submit
    // But for UI feedback we can show what the engine would decide
    // However, the user said "Ninguna pantalla debe calcular etiquetas por su cuenta"
    // So I'll leave it empty or just for preview if needed.
    // Actually, I'll remove this useEffect to obey the rule.
  }, [bagCount, customerId, allPedidos, allCustomers]);

  const handleSubmit = async () => {
    try {
      const pedidoData = {
        customerId,
        customerName,
        itemCount: Number(itemCount),
        bagCount: Number(bagCount),
        label: '',
        labelType: '',
        status,
        totalAmount: Number(totalAmount),
        date: new Date().toISOString(),
        labelVersion: 1
      };

      const created = await addDoc(collection(db, 'pedidos'), pedidoData);

      const updatedPedidos = [...allPedidos, { ...pedidoData, id: created.id }];

      await syncLabelsForCustomer(customerId, updatedPedidos, allCustomers);
      onClose();
    } catch (error) {
      console.error('Error adding pedido:', error);
    }
  };

  if (showVerify) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
          onClick={() => setShowVerify(false)} 
        />
        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="bg-white w-full max-w-[420px] rounded-[32px] overflow-hidden relative z-10 shadow-2xl flex flex-col page-container no-scrollbar"
        >
          {/* 1. HEADER */}
          <div className="p-6 pb-4 flex justify-between items-start">
            <div className="flex gap-4">
              <button onClick={() => setShowVerify(false)} className="p-2.5 bg-gray-50 rounded-full text-gray-400 border border-gray-100">
                <ChevronLeft size={20} />
              </button>
              <div>
                <p className="text-[10px] font-black text-[#E91E8C] tracking-widest uppercase mb-1">
                  DETALLE DEL PEDIDO
                </p>
                <h1 className="text-[26px] font-black text-[#1a1a1a] leading-[1.1] uppercase tracking-tight">
                  {customerName.split(' ').slice(0, 2).join(' ')}<br/>
                  {customerName.split(' ').slice(2).join(' ')}
                </h1>
              </div>
            </div>
          </div>

          {/* 2. SUMMARY CARDS */}
          <div className="px-6 py-4 grid grid-cols-2 gap-3">
            <div className="bg-[#FFF1F2] rounded-[20px] p-4 border border-[#FFE4E6] flex flex-col justify-center">
              <span className="text-[8px] font-bold text-[#BE185D] uppercase tracking-widest block mb-1">TOTAL PEDIDO</span>
              <span className="text-xl font-black text-[#BE185D]">Bs {totalAmount}</span>
            </div>
            <div className="order-card-bg p-4 flex flex-col justify-center">
              <span className="text-[8px] font-bold text-[#94A3B8] uppercase tracking-widest block mb-1">PAGOS REALIZADOS</span>
              <span className="text-xl font-black text-[#1E293B]">{paymentCount}</span>
            </div>
          </div>

          {/* 3. SIMPLIFIED DESIGN KIT */}
          <div className="px-6 py-4 flex-1 flex flex-col justify-center">
            <div className="clone-kit-container">
              {/* Botón de Reseteo Maestro */}
              <button 
                onClick={() => {
                  setItemCount('0');
                  setBagCount('0');
                }} 
                className="reset-button"
              >
                <p className="reset-text">Resumen del Pedido</p>
              </button>
              
              <div className="icons-grid">
                {/* Prenda */}
                <motion.button 
                  onClick={() => setItemCount(prev => (Number(prev) + 1).toString())}
                  whileTap={{ scale: 0.9 }}
                  className="icon-unit"
                >
                  <div className="icon-box">
                    <Shirt size={28} />
                  </div>
                  <AnimatePresence mode="wait">
                    <motion.p 
                      key={itemCount}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="unit-label"
                    >
                      {itemCount} Prendas
                    </motion.p>
                  </AnimatePresence>
                </motion.button>
                
                <div className="divider" />
                
                {/* Bolsa */}
                <motion.button 
                  onClick={() => setBagCount(prev => (Number(prev) + 1).toString())}
                  whileTap={{ scale: 0.9 }}
                  className="icon-unit"
                >
                  <div className="icon-box">
                    <ShoppingBag size={28} />
                  </div>
                  <AnimatePresence mode="wait">
                    <motion.p 
                      key={bagCount}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="unit-label"
                    >
                      {bagCount} Bolsa{Number(bagCount) !== 1 ? 's' : ''}
                    </motion.p>
                  </AnimatePresence>
                </motion.button>

                <div className="divider" />

                {/* Etiqueta (Read-only) */}
                <div className="icon-unit opacity-80">
                  <div className="icon-box bg-gray-50 border-gray-100">
                    <Tag size={28} className="text-gray-400" />
                  </div>
                  <AnimatePresence mode="wait">
                    <motion.p 
                      key={label}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="unit-label text-gray-500"
                    >
                      {label}
                    </motion.p>
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>

          {/* 5. CTA BUTTON */}
          <div className="p-6 pb-12">
            <button onClick={handleSubmit} className="btn-confirm-main">
              <span className="uppercase">CONFIRMAR {bagCount} BOLSA {label}</span>
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                <Check size={18} strokeWidth={3} />
              </div>
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
        onClick={onClose} 
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-white w-full max-w-sm rounded-[32px] p-8 relative z-10 shadow-2xl"
      >
        <div className="flex justify-between items-center mb-8">
          <div>
            <h3 className="text-xl font-black text-[#1A237E] tracking-tight uppercase">Nuevo Pedido</h3>
            <p className="text-[10px] font-bold text-base-text-muted uppercase tracking-widest">{customerName}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-gray-50 text-base-text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={(e) => { 
          e.preventDefault(); 
          if (status === 'procesar' || status === 'verificado') {
            setShowVerify(true); 
          } else {
            handleSubmit();
          }
        }} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-base-text-muted uppercase tracking-wider ml-1">Prendas</label>
              <input 
                type="number" placeholder="0" 
                className="input-modern"
                value={itemCount} onChange={e => setItemCount(e.target.value)} required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-base-text-muted uppercase tracking-wider ml-1">Bolsas</label>
              <input 
                type="number" placeholder="0" 
                className="input-modern"
                value={bagCount} onChange={e => setBagCount(e.target.value)} required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-base-text-muted uppercase tracking-wider ml-1">Etiqueta (Label)</label>
            <div className="input-modern bg-gray-50 text-gray-400 flex items-center px-4 font-black">
              {label}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-base-text-muted uppercase tracking-wider ml-1">Total Bs</label>
            <input 
              type="number" placeholder="0.00" 
              className="input-modern"
              value={totalAmount} onChange={e => setTotalAmount(e.target.value)} required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-base-text-muted uppercase tracking-wider ml-1">Estado</label>
            <div className="flex gap-2">
              {['procesar', 'listo', 'entregado'].map((s, sIdx) => (
                <button
                  key={`${s}-${sIdx}`}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={cn(
                    "flex-1 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all",
                    status === s ? "bg-[#1A237E] text-white shadow-lg" : "bg-gray-100 text-base-text-muted"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <button type="submit" className="w-full btn-pill-primary py-4 mt-4 bg-[#1A237E] hover:bg-[#1A237E]/90">
            {status === 'verificado' ? 'Verificar Pedido' : 'Guardar Pedido'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

