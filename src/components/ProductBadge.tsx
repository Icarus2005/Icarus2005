import { PRODUCTS_META, type ProductKey, isProductKey } from "@/lib/products";

/**
 * Consistent product badge: colored dot + label so colour is never the only
 * indicator. Size "sm" for table rows, "md" for headers/cards.
 */
export default function ProductBadge({
  product,
  size = "sm",
  muted = false,
}: {
  product: string | null | undefined;
  size?: "sm" | "md";
  muted?: boolean;
}) {
  const key: ProductKey = isProductKey(product ?? "") ? (product as ProductKey) : "UNASSIGNED";
  const meta = PRODUCTS_META[key];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${
        muted ? "bg-gray-50 text-gray-500" : meta.badge
      } ${size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm"}`}
    >
      <span className={`rounded-full ${meta.dot} ${size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2"}`} aria-hidden />
      {meta.label}
    </span>
  );
}
