import { For } from "solid-js";
import { Dynamic } from "@solidjs/web";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  CalendarDays,
  Check,
  CircleHelp,
  Funnel,
  Leaf,
  LogOut,
  Menu,
  Moon,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Utensils,
  UserRound,
  X,
} from "lucide";

const icons = {
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  arrowUp: ArrowUp,
  arrowUpRight: ArrowUpRight,
  sparkles: Sparkles,
  moon: Moon,
  circleHelp: CircleHelp,
  leaf: Leaf,
  utensils: Utensils,
  calendar: CalendarDays,
  rotate: RotateCcw,
  userRound: UserRound,
  logOut: LogOut,
  plus: Plus,
  check: Check,
  x: X,
  menu: Menu,
  funnel: Funnel,
  pencil: Pencil,
  search: Search,
  trash: Trash2,
};

type IconNode = readonly [string, Record<string, string | number>];

// Lucide supplies the icon nodes; this tiny Solid 2 adapter only renders them.
export default function Icon(props: {
  name: keyof typeof icons;
  size?: number;
  class?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      class={props.class}
      width={props.size ?? 20}
      height={props.size ?? 20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={props.strokeWidth ?? 1.8}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <For each={icons[props.name] as IconNode[]}>
        {([tag, attributes]) => <Dynamic component={tag} {...attributes} />}
      </For>
    </svg>
  );
}
