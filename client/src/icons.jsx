/* Central icon layer — every icon in the app renders through this file so
 * sizing and stroke weight stay consistent. Each exported component takes
 * the same props as its lucide counterpart (size, strokeWidth, className…)
 * with sensible app-wide defaults. */
import {
    ArrowRight,
    Award,
    Banknote,
    Bell,
    Camera,
    Check,
    CircleCheck,
    Clock3,
    CookingPot,
    Drumstick,
    Flame,
    Inbox,
    Leaf,
    MapPin,
    Maximize,
    Medal,
    Minus,
    MonitorPlay,
    NotebookPen,
    Pause,
    Pencil,
    Phone,
    Play,
    Plus,
    QrCode,
    Repeat2,
    Search,
    Star,
    Store,
    TriangleAlert,
    Trophy,
    Users,
    UtensilsCrossed,
    Volume2,
    VolumeX,
    X,
    Zap,
} from "lucide-react";

const icon = (Cmp, defaultSize = 15) =>
    function Icon({
        size = defaultSize,
        strokeWidth = 2.25,
        className = "",
        ...rest
    }) {
        return (
            <Cmp
                size={size}
                strokeWidth={strokeWidth}
                aria-hidden="true"
                className={`ic ${className}`.trim()}
                {...rest}
            />
        );
    };

// media / fallbacks
export const FoodIcon = icon(UtensilsCrossed, 24); // plate fallback for dishes
export const StoreIcon = icon(Store, 22); // canteen fallback

// money & pay
export const CashIcon = icon(Banknote, 14);
export const QrIcon = icon(QrCode, 14);

// actions
export const CloseIcon = icon(X, 16);
export const CheckIcon = icon(Check, 15);
export const CircleCheckIcon = icon(CircleCheck, 13);
export const PencilIcon = icon(Pencil, 13);
export const MinusIcon = icon(Minus, 14);
export const PlusIcon = icon(Plus, 14);
export const RepeatIcon = icon(Repeat2, 14);
export const CameraIcon = icon(Camera, 14);
export const SearchIcon = icon(Search, 15);
export const MaximizeIcon = icon(Maximize, 15);

// availability & time
export const ClockIcon = icon(Clock3, 12);
export const PauseIcon = icon(Pause, 13);
export const PlayIcon = icon(Play, 13);
export const BoltIcon = icon(Zap, 14);

// food & place
export const LeafIcon = icon(Leaf, 13);
export const MeatIcon = icon(Drumstick, 13);
export const PinIcon = icon(MapPin, 12);
export const PhoneIcon = icon(Phone, 12);
export const FlameIcon = icon(Flame, 11);
export const PotIcon = icon(CookingPot, 15);

// badges & rank
export const TrophyIcon = icon(Trophy, 12);
export const MedalIcon = icon(Medal, 12);
export const AwardIcon = icon(Award, 12);
export const StarIcon = icon(Star, 13);
export const ArrowRightIcon = icon(ArrowRight, 14);

// status & alerts
export const AlertIcon = icon(TriangleAlert, 22);
export const BellIcon = icon(Bell, 14);
export const QueueIcon = icon(Users, 12);
export const NoteIcon = icon(NotebookPen, 13);
export const InboxIcon = icon(Inbox, 15);
export const VolOnIcon = icon(Volume2, 14);
export const VolOffIcon = icon(VolumeX, 14);
export const MonitorIcon = icon(MonitorPlay, 14);
