import ProductCatalog from "@/features/products/product-catalog";
import SmartSearchPanel from "@/features/products/smart-search-panel";

export const dynamic = "force-dynamic";

export default function ProductsPage() {
  return (
    <>
      <SmartSearchPanel />
      <ProductCatalog />
    </>
  );
}
