'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/common/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Plus, Pencil } from 'lucide-react';

/* ---------- types ---------- */

interface Category {
  id: string;
  categoryCode: string;
  name: string;
  icon: string | null;
  displayOrder: number;
  description?: string;
}

interface CategoryImageRule {
  id: string;
  categoryId: string;
  imageRequirement: 'required' | 'optional' | 'required_deferrable';
  category: { categoryCode: string; name: string };
}

interface MaterialType {
  id: string;
  typeCode: string;
  name: string;
  inventoryBehavior: string;
  displayOrder: number;
}

interface CategoryTypeProfile {
  id: string;
  categoryId: string;
  materialTypeId: string;
  profileName: string;
}

type CategoryRow = Category & { imageRequirement?: string };

/* ---------- column defs ---------- */

const categoryColumns: ColumnDef<CategoryRow>[] = [
  { accessorKey: 'categoryCode', header: 'Code' },
  { accessorKey: 'name', header: 'Name' },
  {
    id: 'imageRule',
    header: 'Image Rule',
    cell: ({ row }) => {
      const req = row.original.imageRequirement;
      if (!req) return <span className="text-muted-foreground">-</span>;
      const label = req.replace(/_/g, ' ');
      return <Badge variant="outline" className="capitalize">{label}</Badge>;
    },
  },
  {
    id: 'status',
    header: 'Status',
    cell: () => <Badge variant="default">active</Badge>,
  },
];

const materialTypeColumns: ColumnDef<MaterialType>[] = [
  { accessorKey: 'typeCode', header: 'Code' },
  { accessorKey: 'name', header: 'Name' },
  {
    accessorKey: 'inventoryBehavior',
    header: 'Inventory Behavior',
    cell: ({ row }) => (
      <Badge variant="outline" className="capitalize">
        {row.original.inventoryBehavior.replace(/_/g, ' ')}
      </Badge>
    ),
  },
];

/* ---------- empty form ---------- */

const emptyCategoryForm = {
  categoryCode: '',
  name: '',
  description: '',
  displayOrder: '',
  imageRequirement: 'optional' as 'required' | 'optional' | 'required_deferrable',
};

/* ---------- page ---------- */

export default function CategoryProfileManagerPage() {
  const router = useRouter();
  const [tab, setTab] = React.useState('categories');

  /* --- categories state --- */
  const [categories, setCategories] = React.useState<CategoryRow[] | null>(null);
  const [imageRules, setImageRules] = React.useState<CategoryImageRule[]>([]);
  const [showCategoryDialog, setShowCategoryDialog] = React.useState(false);
  const [editingCategory, setEditingCategory] = React.useState<CategoryRow | null>(null);
  const [categoryForm, setCategoryForm] = React.useState(emptyCategoryForm);
  const [savingCategory, setSavingCategory] = React.useState(false);

  /* --- material types state --- */
  const [materialTypes, setMaterialTypes] = React.useState<MaterialType[] | null>(null);

  /* --- profiles state --- */
  const [profiles, setProfiles] = React.useState<CategoryTypeProfile[] | null>(null);

  /* ---------- fetchers ---------- */

  const fetchCategories = React.useCallback(async () => {
    try {
      const [catRes, ruleRes] = await Promise.all([
        apiFetch<{ categories: Category[] }>('/api/material/categories'),
        apiFetch<{ rules: CategoryImageRule[] }>('/api/admin/material/category-image-rules'),
      ]);
      setImageRules(ruleRes.rules);
      const ruleMap = new Map(ruleRes.rules.map((r) => [r.categoryId, r.imageRequirement]));
      const merged: CategoryRow[] = catRes.categories.map((c) => ({
        ...c,
        imageRequirement: ruleMap.get(c.id),
      }));
      setCategories(merged);
    } catch {
      setCategories([]);
    }
  }, []);

  const fetchMaterialTypes = React.useCallback(async () => {
    try {
      const res = await apiFetch<{ materialTypes: MaterialType[] }>('/api/material/material-types');
      setMaterialTypes(res.materialTypes);
    } catch {
      setMaterialTypes([]);
    }
  }, []);

  const fetchProfiles = React.useCallback(async () => {
    try {
      const res = await apiFetch<CategoryTypeProfile[]>('/api/material/category-type-profiles');
      setProfiles(res);
    } catch {
      setProfiles([]);
    }
  }, []);

  /* load data on mount */
  React.useEffect(() => { fetchCategories(); }, [fetchCategories]);
  React.useEffect(() => { fetchMaterialTypes(); }, [fetchMaterialTypes]);
  React.useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  /* ---------- category create/edit ---------- */

  function openCreateCategory() {
    setEditingCategory(null);
    setCategoryForm(emptyCategoryForm);
    setShowCategoryDialog(true);
  }

  function openEditCategory(row: CategoryRow) {
    setEditingCategory(row);
    const rule = imageRules.find((r) => r.categoryId === row.id);
    setCategoryForm({
      categoryCode: row.categoryCode,
      name: row.name,
      description: row.description ?? '',
      displayOrder: String(row.displayOrder),
      imageRequirement: (rule?.imageRequirement ?? 'optional') as typeof emptyCategoryForm.imageRequirement,
    });
    setShowCategoryDialog(true);
  }

  async function handleSaveCategory() {
    setSavingCategory(true);
    try {
      const payload = {
        categoryCode: categoryForm.categoryCode,
        name: categoryForm.name,
        description: categoryForm.description || undefined,
        displayOrder: Number(categoryForm.displayOrder) || 0,
        imageRequirement: categoryForm.imageRequirement,
      };
      if (editingCategory) {
        await apiFetch(`/api/admin/material/categories/${editingCategory.id}`, {
          method: 'PUT',
          body: payload,
        });
        toast.success('Category updated');
      } else {
        await apiFetch('/api/admin/material/categories', {
          method: 'POST',
          body: payload,
        });
        toast.success('Category created');
      }
      setShowCategoryDialog(false);
      setCategoryForm(emptyCategoryForm);
      setEditingCategory(null);
      fetchCategories();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to save category');
    } finally {
      setSavingCategory(false);
    }
  }

  /* ---------- profile matrix helpers ---------- */

  function getProfileForCell(categoryId: string, typeId: string): CategoryTypeProfile | undefined {
    return profiles?.find((p) => p.categoryId === categoryId && p.materialTypeId === typeId);
  }

  /* ---------- description ---------- */

  const description = (() => {
    const parts: string[] = [];
    if (categories) parts.push(`${categories.length} categories`);
    if (materialTypes) parts.push(`${materialTypes.length} types`);
    if (profiles) parts.push(`${profiles.length} profiles`);
    return parts.length > 0 ? parts.join(', ') : 'Loading...';
  })();

  /* ---------- render ---------- */

  return (
    <div className="space-y-4">
      <PageHeader
        title="Category & Profile Manager"
        description={description}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="types">Material Types</TabsTrigger>
          <TabsTrigger value="profiles">Category-Type Profiles</TabsTrigger>
        </TabsList>

        {/* ===== Tab 1: Categories ===== */}
        <TabsContent value="categories" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={openCreateCategory}>
              <Plus className="h-4 w-4 mr-1" />Add Category
            </Button>
          </div>

          <DataTable
            columns={[
              ...categoryColumns,
              {
                id: 'actions',
                header: '',
                cell: ({ row }) => (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditCategory(row.original);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                ),
              },
            ]}
            data={categories ?? []}
            loading={categories === null}
            pageSize={20}
          />
        </TabsContent>

        {/* ===== Tab 2: Material Types ===== */}
        <TabsContent value="types" className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">
                Material types are system-defined and read-only.
              </p>
            </CardContent>
          </Card>

          <DataTable
            columns={materialTypeColumns}
            data={materialTypes ?? []}
            loading={materialTypes === null}
            pageSize={20}
          />
        </TabsContent>

        {/* ===== Tab 3: Category-Type Profiles ===== */}
        <TabsContent value="profiles" className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">
                Click a profile name to view and edit its attribute definitions.
              </p>
            </CardContent>
          </Card>

          {(categories === null || materialTypes === null || profiles === null) ? (
            <div className="rounded-md border bg-background p-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : categories.length === 0 || materialTypes.length === 0 ? (
            <div className="rounded-md border bg-background p-8 text-center text-sm text-muted-foreground">
              Add categories and material types to see the profile matrix.
            </div>
          ) : (
            <div className="rounded-md border bg-background overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="text-xs uppercase tracking-wider font-semibold min-w-[140px]">
                      Category
                    </TableHead>
                    {materialTypes.map((mt) => (
                      <TableHead
                        key={mt.id}
                        className="text-xs uppercase tracking-wider text-center min-w-[120px]"
                      >
                        {mt.name}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((cat) => (
                    <TableRow key={cat.id}>
                      <TableCell className="font-medium">
                        {cat.name}
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({cat.categoryCode})
                        </span>
                      </TableCell>
                      {materialTypes.map((mt) => {
                        const profile = getProfileForCell(cat.id, mt.id);
                        return (
                          <TableCell key={mt.id} className="text-center">
                            {profile ? (
                              <Button
                                variant="link"
                                size="sm"
                                className="h-auto p-0 text-sm"
                                onClick={() =>
                                  router.push(`/admin/material/profiles/${profile.id}`)
                                }
                              >
                                {profile.profileName}
                              </Button>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ===== Category Create/Edit Dialog ===== */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? 'Edit Category' : 'New Category'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Category Code *</Label>
                <Input
                  value={categoryForm.categoryCode}
                  onChange={(e) =>
                    setCategoryForm((f) => ({ ...f, categoryCode: e.target.value }))
                  }
                  placeholder="e.g. BOARD"
                  disabled={!!editingCategory}
                />
              </div>
              <div>
                <Label>Name *</Label>
                <Input
                  value={categoryForm.name}
                  onChange={(e) =>
                    setCategoryForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="e.g. Boards"
                />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={categoryForm.description}
                onChange={(e) =>
                  setCategoryForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={2}
                placeholder="Optional description"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Display Order</Label>
                <Input
                  type="number"
                  value={categoryForm.displayOrder}
                  onChange={(e) =>
                    setCategoryForm((f) => ({ ...f, displayOrder: e.target.value }))
                  }
                  placeholder="0"
                />
              </div>
              <div>
                <Label>Image Requirement</Label>
                <Select
                  value={categoryForm.imageRequirement}
                  onValueChange={(v) =>
                    setCategoryForm((f) => ({
                      ...f,
                      imageRequirement: v as typeof emptyCategoryForm.imageRequirement,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="required">Required</SelectItem>
                    <SelectItem value="optional">Optional</SelectItem>
                    <SelectItem value="required_deferrable">Required (deferrable)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCategoryDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveCategory}
              disabled={
                savingCategory ||
                !categoryForm.categoryCode ||
                !categoryForm.name
              }
            >
              {savingCategory
                ? 'Saving...'
                : editingCategory
                  ? 'Update'
                  : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
