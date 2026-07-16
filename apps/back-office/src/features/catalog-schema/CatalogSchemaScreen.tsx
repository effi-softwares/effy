import { useQuery } from "@tanstack/react-query";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@effy/design-system/ui";

import { sessionQuery } from "@/features/auth/queries";

import { canManageCatalog } from "./access";
import { AttributesTab } from "./components/AttributesTab";
import { CategoriesTab } from "./components/CategoriesTab";
import { ProductTypesTab } from "./components/ProductTypesTab";

// The catalog schema authority (016, US1). One sectioned page (no cards, DOCTRINE-2) with three
// tabs — Product Types, Attributes, Categories. Read access is open to every back-office role; the
// mutating controls inside each tab are revealed only for admin/manager (backend authoritative).
export function CatalogSchemaScreen() {
  const { data: session } = useQuery(sessionQuery);
  const roles = session?.status === "signed-in" ? session.identity.roles : [];
  const canManage = canManageCatalog(roles);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Catalog</h1>
        <p className="text-muted-foreground">
          The schema that drives every product: types, their attributes, and the category taxonomy.
        </p>
      </div>

      <Tabs defaultValue="types">
        <TabsList>
          <TabsTrigger value="types">Product Types</TabsTrigger>
          <TabsTrigger value="attributes">Attributes</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>
        <TabsContent value="types" className="pt-2">
          <ProductTypesTab canManage={canManage} />
        </TabsContent>
        <TabsContent value="attributes" className="pt-2">
          <AttributesTab canManage={canManage} />
        </TabsContent>
        <TabsContent value="categories" className="pt-2">
          <CategoriesTab canManage={canManage} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
