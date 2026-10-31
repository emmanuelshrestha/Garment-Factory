import React, { useState, useEffect, useMemo } from 'react';
import { 
  Scissors, Tag, Layers, Search, PlusCircle, Check, 
  X, RefreshCw, Eye, Edit2, Power, Trash2, Image as ImageIcon,
  ChevronLeft, ChevronRight, CheckSquare, Square, GripVertical,
  ArrowLeft, CheckCircle2, AlertTriangle, Building2, SlidersHorizontal,
  Palette, Ruler, LayoutGrid, List
} from 'lucide-react';
import { api, type Product, type Colour, type Size, type Currency, type ProductVariant, formatMoney } from '../api';

// ─── Types ───────────────────────────────────────────────────────────────────

type CatalogueSubTab = 'products' | 'variants' | 'attributes';

interface ParsedProductMetadata {
  stitchingRateMinor: number | null;
  techSpecs: string;
}

function parseProductMetadata(rawCategory: string | null | undefined): { cleanCategory: string; meta: ParsedProductMetadata } {
  if (!rawCategory) {
    return { cleanCategory: '', meta: { stitchingRateMinor: null, techSpecs: '' } };
  }

  const match = rawCategory.match(/^(.*?)\s*\[Rate:\s*([\d.]+)?\s*\|\s*Specs:\s*(.*?)\]$/s);
  if (match) {
    const cleanCategory = match[1].trim();
    const rateVal = match[2] ? Math.round(parseFloat(match[2]) * 100) : null;
    const techSpecs = match[3] ? match[3].trim() : '';
    return {
      cleanCategory,
      meta: {
        stitchingRateMinor: rateVal,
        techSpecs,
      },
    };
  }

  return { cleanCategory: rawCategory, meta: { stitchingRateMinor: null, techSpecs: '' } };
}

function buildCategoryPayload(category: string, stitchingRateMinor: number | null, techSpecs: string): string {
  const cleanCat = category.trim();
  const rateVal = stitchingRateMinor != null ? (stitchingRateMinor / 100).toFixed(2) : '';
  const cleanSpecs = techSpecs.trim();

  if (rateVal || cleanSpecs) {
    return `${cleanCat} [Rate: ${rateVal} | Specs: ${cleanSpecs}]`.trim();
  }
  return cleanCat;
}

// ─── Custom Modal Dialog Box State ───────────────────────────────────────────

interface CustomDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

export const CatalogueView: React.FC = () => {
  const [subTab, setSubTab] = useState<CatalogueSubTab>('products');

  // Global Dialog State
  const [dialog, setDialog] = useState<CustomDialogState>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const openConfirmDialog = (config: Omit<CustomDialogState, 'isOpen'>) => {
    setDialog({ ...config, isOpen: true });
  };

  const closeDialog = () => {
    setDialog(prev => ({ ...prev, isOpen: false }));
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto font-sans">
      {/* Sub-Tab Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-slate-100">
            Garment Catalogue & Production Masters
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage garment styles, stitching labor rates, fabric specs, colors, sizes, and SKU matrices.
          </p>
        </div>
        <div className="flex space-x-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl overflow-x-auto max-w-full text-xs">
          {(['products', 'variants', 'attributes'] as CatalogueSubTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setSubTab(t)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold capitalize whitespace-nowrap transition ${
                subTab === t 
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {t === 'products' && 'Garment Styles'}
              {t === 'variants' && 'Variant Matrix (Color × Size)'}
              {t === 'attributes' && 'Colours & Sizes'}
            </button>
          ))}
        </div>
      </div>

      {subTab === 'products' && <ProductsPanel openConfirmDialog={openConfirmDialog} />}
      {subTab === 'variants' && <VariantsPanel openConfirmDialog={openConfirmDialog} />}
      {subTab === 'attributes' && <ColoursAndSizesPanel openConfirmDialog={openConfirmDialog} />}

      {/* Reusable Custom Modal Dialog Box */}
      {dialog.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className={`p-2.5 rounded-xl shrink-0 ${dialog.isDestructive ? 'bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400' : 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'}`}>
                {dialog.isDestructive ? <AlertTriangle size={20} /> : <SlidersHorizontal size={20} />}
              </div>
              <div className="space-y-1">
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                  {dialog.title}
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-line leading-relaxed">
                  {dialog.message}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
              <button
                type="button"
                onClick={closeDialog}
                className="px-4 py-2 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition"
              >
                {dialog.cancelText || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  closeDialog();
                  await dialog.onConfirm();
                }}
                className={`px-4 py-2 rounded-xl font-bold text-white transition shadow-xs ${
                  dialog.isDestructive 
                    ? 'bg-red-600 hover:bg-red-700' 
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {dialog.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Image Compression Helper ──────────────────────────────────────────────────

async function compressImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        const maxDim = 1200;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('Failed to load image file'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// ─── Products Panel ───────────────────────────────────────────────────────────

interface ProductsPanelProps {
  openConfirmDialog: (config: Omit<CustomDialogState, 'isOpen'>) => void;
}

const ProductsPanel: React.FC<ProductsPanelProps> = ({ openConfirmDialog }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [allVariants, setAllVariants] = useState<ProductVariant[]>([]);
  const [allColours, setAllColours] = useState<Colour[]>([]);
  const [allSizes, setAllSizes] = useState<Size[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');

  const [inspectingProduct, setInspectingProduct] = useState<Product | null>(null);
  const [activePreviewImage, setActivePreviewImage] = useState<string | null>(null);

  const [variantLayoutMode, setVariantLayoutMode] = useState<'grouped' | 'compact_list'>('grouped');
  const [selectedVariantIds, setSelectedVariantIds] = useState<number[]>([]);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  const [orderedProductIds, setOrderedProductIds] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('garment_product_display_order');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [draggedProdId, setDraggedProdId] = useState<number | null>(null);
  const [dragOverProdId, setDragOverProdId] = useState<number | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  
  const [form, setForm] = useState<{
    code: string;
    name: string;
    category: string;
    defaultPriceMinor: string;
    stitchingRateMinor: string;
    techSpecs: string;
    defaultCurrency: Currency;
    images: string[];
    displayImage: string | null;
  }>({
    code: '',
    name: '',
    category: '',
    defaultPriceMinor: '',
    stitchingRateMinor: '',
    techSpecs: '',
    defaultCurrency: 'NPR',
    images: [],
    displayImage: null,
  });

  const [priceForm, setPriceForm] = useState({ productId: 0, priceMinor: '', note: '' });
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [urlInput, setUrlInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [lightboxProduct, setLightboxProduct] = useState<Product | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const [prodRes, varRes, colRes, sizeRes] = await Promise.all([
        api.getProducts(),
        api.getVariants().catch(() => ({ variants: [] })),
        api.getColours().catch(() => ({ colours: [] })),
        api.getSizes().catch(() => ({ sizes: [] })),
      ]);
      const incomingProducts = prodRes.products || [];
      setProducts(incomingProducts);
      setAllVariants(varRes.variants || []);
      setAllColours(colRes.colours || []);
      setAllSizes((sizeRes.sizes || []).sort((a, b) => a.sortOrder - b.sortOrder));

      setOrderedProductIds(prev => {
        const existingSet = new Set(prev);
        const incomingIds = incomingProducts.map(p => p.id);
        const newUnordered = incomingIds.filter(id => !existingSet.has(id));
        if (newUnordered.length > 0) {
          const updated = [...prev, ...newUnordered];
          localStorage.setItem('garment_product_display_order', JSON.stringify(updated));
          return updated;
        }
        return prev;
      });

      if (inspectingProduct) {
        const refreshed = incomingProducts.find(p => p.id === inspectingProduct.id);
        if (refreshed) setInspectingProduct(refreshed);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (inspectingProduct) {
      const cover = inspectingProduct.displayImage || inspectingProduct.images?.[0] || null;
      setActivePreviewImage(cover);
    }
  }, [inspectingProduct]);

  const handleDragStart = (e: React.DragEvent, id: number) => {
    setDraggedProdId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id.toString());
  };

  const handleDragOver = (e: React.DragEvent, id: number) => {
    e.preventDefault();
    if (id !== dragOverProdId) {
      setDragOverProdId(id);
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    if (draggedProdId === null || draggedProdId === targetId) {
      setDraggedProdId(null);
      setDragOverProdId(null);
      return;
    }

    setOrderedProductIds(prev => {
      const currentList = [...prev];
      const sourceIndex = currentList.indexOf(draggedProdId);
      const targetIndex = currentList.indexOf(targetId);
      if (sourceIndex === -1 || targetIndex === -1) return prev;

      currentList.splice(sourceIndex, 1);
      currentList.splice(targetIndex, 0, draggedProdId);

      localStorage.setItem('garment_product_display_order', JSON.stringify(currentList));
      return currentList;
    });

    setDraggedProdId(null);
    setDragOverProdId(null);
  };

  const handleDragEnd = () => {
    setDraggedProdId(null);
    setDragOverProdId(null);
  };

  const openCreate = () => {
    setEditProduct(null);
    setForm({
      code: '',
      name: '',
      category: '',
      defaultPriceMinor: '',
      stitchingRateMinor: '',
      techSpecs: '',
      defaultCurrency: 'NPR',
      images: [],
      displayImage: null,
    });
    setUrlInput('');
    setShowUrlInput(false);
    setError(null);
    setShowModal(true);
  };

  const openEdit = (p: Product) => {
    setEditProduct(p);
    const { cleanCategory, meta } = parseProductMetadata(p.category);
    const initialImages = p.images || [];
    const initialDisplay = p.displayImage || (initialImages.length > 0 ? initialImages[0] : null);

    setForm({
      code: p.code,
      name: p.name,
      category: cleanCategory,
      defaultPriceMinor: p.defaultPriceMinor != null ? (p.defaultPriceMinor / 100).toFixed(2) : '',
      stitchingRateMinor: meta.stitchingRateMinor != null ? (meta.stitchingRateMinor / 100).toFixed(2) : '',
      techSpecs: meta.techSpecs,
      defaultCurrency: p.defaultCurrency,
      images: initialImages,
      displayImage: initialDisplay,
    });
    setUrlInput('');
    setShowUrlInput(false);
    setError(null);
    setShowModal(true);
  };

  const handleFilesSelected = async (files: FileList | File[]) => {
    const fileArr = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (fileArr.length === 0) return;

    const remainingSlots = 4 - form.images.length;
    if (remainingSlots <= 0) {
      openConfirmDialog({
        title: 'Image Limit Reached',
        message: 'A maximum of 4 images can be saved per garment style.',
        confirmText: 'Understood',
        onConfirm: () => {},
      });
      return;
    }

    const filesToProcess = fileArr.slice(0, remainingSlots);
    setUploadingImage(true);
    try {
      const compressedList = await Promise.all(filesToProcess.map(f => compressImageFile(f)));
      setForm(prev => {
        const newImages = [...prev.images, ...compressedList].slice(0, 4);
        const newDisplay = prev.displayImage && newImages.includes(prev.displayImage)
          ? prev.displayImage
          : (newImages[0] ?? null);
        return { ...prev, images: newImages, displayImage: newDisplay };
      });
    } catch (err: any) {
      setError(err.message || 'Failed to process images');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSetDisplay = (img: string) => {
    setForm(prev => ({ ...prev, displayImage: img }));
  };

  const handleRemoveImage = (index: number) => {
    setForm(prev => {
      const removed = prev.images[index];
      const newImages = prev.images.filter((_, i) => i !== index);
      let newDisplay = prev.displayImage;
      if (newDisplay === removed || !newImages.includes(newDisplay || '')) {
        newDisplay = newImages[0] ?? null;
      }
      return { ...prev, images: newImages, displayImage: newDisplay };
    });
  };

  const handleAddUrl = () => {
    const url = urlInput.trim();
    if (!url) return;
    if (form.images.length >= 4) {
      openConfirmDialog({
        title: 'Image Limit Reached',
        message: 'A maximum of 4 images can be saved per garment style.',
        confirmText: 'Understood',
        onConfirm: () => {},
      });
      return;
    }
    setForm(prev => {
      const newImages = [...prev.images, url].slice(0, 4);
      const newDisplay = prev.displayImage && newImages.includes(prev.displayImage)
        ? prev.displayImage
        : (newImages[0] ?? null);
      return { ...prev, images: newImages, displayImage: newDisplay };
    });
    setUrlInput('');
    setShowUrlInput(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const priceMinor = form.defaultPriceMinor ? Math.round(parseFloat(form.defaultPriceMinor) * 100) : undefined;
    const stitchingMinor = form.stitchingRateMinor ? Math.round(parseFloat(form.stitchingRateMinor) * 100) : null;
    const payloadCategory = buildCategoryPayload(form.category, stitchingMinor, form.techSpecs);

    try {
      if (editProduct) {
        await api.updateProduct(editProduct.id, {
          code: form.code.trim().toUpperCase(),
          name: form.name.trim(),
          category: payloadCategory || null,
          defaultPriceMinor: priceMinor ?? null,
          defaultCurrency: form.defaultCurrency,
          images: form.images,
          displayImage: form.displayImage,
        });
      } else {
        await api.createProduct({
          code: form.code.trim().toUpperCase(),
          name: form.name.trim(),
          category: payloadCategory || undefined,
          defaultPriceMinor: priceMinor,
          defaultCurrency: form.defaultCurrency,
          images: form.images,
          displayImage: form.displayImage,
        });
      }
      setShowModal(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = (p: Product) => {
    const action = p.isActive ? 'Archive' : 'Restore';
    openConfirmDialog({
      title: `${action} Garment Style`,
      message: `Are you sure you want to ${action.toLowerCase()} style "${p.name}" (${p.code})?`,
      confirmText: action,
      isDestructive: p.isActive,
      onConfirm: async () => {
        try {
          await api.updateProduct(p.id, { isActive: !p.isActive });
          await load();
        } catch (e: any) {
          setError(e.message);
        }
      },
    });
  };

  const handleDelete = (p: Product) => {
    openConfirmDialog({
      title: 'Permanently Delete Garment Style',
      message: `Permanently delete style "${p.code} - ${p.name}"?\n\nIf this style has past cutting records or customer orders, it will fail safely and should be archived instead.`,
      confirmText: 'Delete Permanently',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await api.deleteProduct(p.id);
          if (inspectingProduct?.id === p.id) setInspectingProduct(null);
          await load();
        } catch (e: any) {
          setError(e.message);
        }
      },
    });
  };

  const handleSetPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    const minor = Math.round(parseFloat(priceForm.priceMinor) * 100);
    try {
      await api.setProductPrice(priceForm.productId, minor, priceForm.note || undefined);
      setShowPriceModal(false);
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const openLightbox = (p: Product, initialIdx = 0) => {
    setLightboxProduct(p);
    setLightboxIndex(initialIdx);
  };

  const filteredProducts = useMemo(() => {
    const orderMap = new Map<number, number>();
    orderedProductIds.forEach((id, index) => orderMap.set(id, index));

    const list = [...products].sort((a, b) => {
      const posA = orderMap.has(a.id) ? orderMap.get(a.id)! : 99999;
      const posB = orderMap.has(b.id) ? orderMap.get(b.id)! : 99999;
      return posA - posB;
    });

    return list.filter((p) => {
      if (statusFilter === 'active' && !p.isActive) return false;
      if (statusFilter === 'inactive' && p.isActive) return false;

      const q = search.trim().toLowerCase();
      if (!q) return true;

      const { cleanCategory, meta } = parseProductMetadata(p.category);
      return (
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        cleanCategory.toLowerCase().includes(q) ||
        meta.techSpecs.toLowerCase().includes(q)
      );
    });
  }, [products, statusFilter, search, orderedProductIds]);

  const inspectedVariants = useMemo(() => {
    if (!inspectingProduct) return [];
    return allVariants.filter(v => v.productId === inspectingProduct.id);
  }, [allVariants, inspectingProduct]);

  const inspectedVariantsByColour = useMemo(() => {
    const map = new Map<string, ProductVariant[]>();
    inspectedVariants.forEach(v => {
      const current = map.get(v.colour) || [];
      current.push(v);
      map.set(v.colour, current);
    });
    return Array.from(map.entries());
  }, [inspectedVariants]);

  const inspectedMatrixExistence = useMemo(() => {
    const map = new Map<string, { exists: boolean; isActive: boolean; variantId: number }>();
    inspectedVariants.forEach(v => {
      map.set(`${v.colour.toLowerCase()}|${v.size.toLowerCase()}`, { 
        exists: true, 
        isActive: v.isActive,
        variantId: v.id 
      });
    });
    return map;
  }, [inspectedVariants]);

  const handleSelectAllVariants = () => {
    if (selectedVariantIds.length === inspectedVariants.length) {
      setSelectedVariantIds([]);
    } else {
      setSelectedVariantIds(inspectedVariants.map(v => v.id));
    }
  };

  const handleToggleSelectVariant = (id: number) => {
    setSelectedVariantIds(prev => prev.includes(id) ? prev.filter(vId => vId !== id) : [...prev, id]);
  };

  const handleBulkSetVariantStatus = (targetActive: boolean) => {
    if (selectedVariantIds.length === 0) return;
    const actionLabel = targetActive ? 'Activate' : 'Deactivate';

    openConfirmDialog({
      title: `${actionLabel} Selected Variants`,
      message: `Are you sure you want to ${actionLabel.toLowerCase()} ${selectedVariantIds.length} selected SKU variant(s)?`,
      confirmText: actionLabel,
      isDestructive: !targetActive,
      onConfirm: async () => {
        try {
          setBulkActionLoading(true);
          for (const vId of selectedVariantIds) {
            await api.updateVariant(vId, { isActive: targetActive });
          }
          setSelectedVariantIds([]);
          await load();
        } catch (err: any) {
          setError(err.message || 'Failed to update some variants');
        } finally {
          setBulkActionLoading(false);
        }
      },
    });
  };

  const handleBulkDeleteVariants = () => {
    if (selectedVariantIds.length === 0) return;

    openConfirmDialog({
      title: 'Delete Selected Variants',
      message: `Are you sure you want to permanently delete ${selectedVariantIds.length} selected SKU variant(s)?\n\nNote: SKUs with past order or stock history cannot be deleted and should be deactivated instead.`,
      confirmText: 'Delete Selected',
      isDestructive: true,
      onConfirm: async () => {
        try {
          setBulkActionLoading(true);
          for (const vId of selectedVariantIds) {
            await api.deleteVariant(vId);
          }
          setSelectedVariantIds([]);
          await load();
        } catch (err: any) {
          setError(err.message || 'Failed to delete some variants');
        } finally {
          setBulkActionLoading(false);
        }
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* ══════════════════ CASE A: PRODUCT DETAILS INSPECTOR ══════════════════ */}
      {inspectingProduct ? (
        <div className="space-y-4">
          {/* Top Inspector Header with Action Buttons */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setInspectingProduct(null);
                  setSelectedVariantIds([]);
                }}
                className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1"
                title="Back to All Styles"
              >
                <ArrowLeft size={16} />
                <span className="hidden sm:inline">Back to Styles</span>
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900">
                    {inspectingProduct.code}
                  </span>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                    {inspectingProduct.name}
                  </h2>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                    inspectingProduct.isActive 
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' 
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 line-through'
                  }`}>
                    {inspectingProduct.isActive ? 'Active Style' : 'Archived'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Production blueprint, high-contrast matrix availability, and color-grouped SKU management.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => openEdit(inspectingProduct)}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
              >
                <Edit2 size={13} />
                <span>Edit Style</span>
              </button>

              <button
                type="button"
                onClick={() => { setPriceForm({ productId: inspectingProduct.id, priceMinor: '', note: '' }); setShowPriceModal(true); }}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
              >
                <Tag size={13} />
                <span>Set Price</span>
              </button>

              <button
                type="button"
                onClick={() => handleToggleActive(inspectingProduct)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  inspectingProduct.isActive 
                    ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400' 
                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                }`}
              >
                <Power size={13} />
                <span>{inspectingProduct.isActive ? 'Archive Style' : 'Restore Style'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleDelete(inspectingProduct)}
                className="p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-xl transition"
                title="Delete style"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          {/* ════════════ PRODUCT HERO WITH IMAGERY & TECHNICAL SPECS ════════════ */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              {/* Product Gallery Images */}
              <div className="md:col-span-4 space-y-3">
                <div 
                  onClick={() => openLightbox(inspectingProduct, 0)}
                  className="aspect-square w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 cursor-pointer group relative shadow-2xs"
                  title="Click to zoom in"
                >
                  {activePreviewImage ? (
                    <img
                      src={activePreviewImage}
                      alt={inspectingProduct.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                      <ImageIcon size={32} />
                      <span className="text-xs font-semibold mt-1">No Photo Added</span>
                    </div>
                  )}
                  {activePreviewImage && (
                    <span className="absolute bottom-2 right-2 bg-slate-900/80 text-white text-[10px] font-bold px-2 py-0.5 rounded-lg backdrop-blur-xs flex items-center gap-1">
                      <Eye size={12} /> View Full
                    </span>
                  )}
                </div>

                {/* Gallery Thumbnail Strip */}
                {inspectingProduct.images && inspectingProduct.images.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {inspectingProduct.images.map((img, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActivePreviewImage(img)}
                        className={`w-14 h-14 rounded-xl overflow-hidden border-2 transition shrink-0 ${
                          activePreviewImage === img 
                            ? 'border-blue-600 ring-2 ring-blue-200 dark:ring-blue-900' 
                            : 'border-slate-200 dark:border-slate-700 opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img src={img} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Technical Blueprint & Pricing Summary */}
              {(() => {
                const { cleanCategory, meta } = parseProductMetadata(inspectingProduct.category);
                return (
                  <div className="md:col-span-8 space-y-4">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-mono font-bold tracking-wider">
                        STYLE SPECIFICATIONS
                      </span>
                      <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                        {inspectingProduct.name}
                      </h3>
                      {cleanCategory && (
                        <span className="inline-block mt-1 px-2.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs">
                          {cleanCategory}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono text-xs">
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] text-slate-400 font-sans block uppercase font-bold">Standard Price</span>
                        <span className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5 block">
                          {inspectingProduct.defaultPriceMinor ? formatMoney(inspectingProduct.defaultPriceMinor, inspectingProduct.defaultCurrency) : '—'}
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/60">
                        <span className="text-[10px] text-purple-600 dark:text-purple-400 font-sans block uppercase font-bold">Stitching Labor Rate</span>
                        <span className="text-base font-bold text-purple-600 dark:text-purple-400 mt-0.5 block">
                          {meta.stitchingRateMinor != null ? formatMoney(meta.stitchingRateMinor, 'NPR') : '—'}
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 col-span-2 sm:col-span-1">
                        <span className="text-[10px] text-slate-400 font-sans block uppercase font-bold">Matrix Total</span>
                        <span className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5 block">
                          {inspectedVariants.length} SKUs
                        </span>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs">
                      <span className="text-[10px] text-slate-400 font-sans block uppercase font-bold mb-1">
                        Fabric & Cutting Technical Specs
                      </span>
                      <p className="text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                        {meta.techSpecs || 'No specific technical specifications entered for this style yet.'}
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* ════════════ 1. VARIANT AVAILABILITY MATRIX (BALANCED CRISP BADGE) ════════════ */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <div>
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Layers size={16} className="text-blue-600 dark:text-blue-400" />
                  Variant Availability Matrix (Color × Size)
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Checkmark badge (<span className="text-emerald-600 font-bold">✓</span>) indicates variant exists in catalogue. Empty cells mean that specific combination has not been generated.
                </p>
              </div>
            </div>

            {/* Availability Grid with balanced tick marks */}
            <div className="overflow-x-auto">
              <table className="w-full text-center text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 font-mono text-[10px] uppercase text-slate-500 tracking-wider">
                    <th className="py-2.5 px-4 text-left font-sans font-bold w-44">Floor Colour</th>
                    {allSizes.map((sz) => (
                      <th key={sz.id} className="py-2.5 px-3 min-w-[56px] font-bold">
                        {sz.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {allColours.map((col) => {
                    const hasAnyForColor = allSizes.some(sz => 
                      inspectedMatrixExistence.has(`${col.name.toLowerCase()}|${sz.name.toLowerCase()}`)
                    );
                    if (!hasAnyForColor) return null;

                    return (
                      <tr key={col.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition">
                        <td className="py-2.5 px-4 text-left font-sans font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2.5">
                          <span className="w-3.5 h-3.5 rounded-full bg-slate-400 dark:bg-slate-500 shadow-2xs shrink-0" />
                          <span className="text-sm">{col.name}</span>
                        </td>
                        {allSizes.map((sz) => {
                          const status = inspectedMatrixExistence.get(`${col.name.toLowerCase()}|${sz.name.toLowerCase()}`);
                          return (
                            <td key={sz.id} className="py-2.5 px-3 text-center">
                              {status?.exists ? (
                                <div className="flex justify-center">
                                  <span 
                                    className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-sm font-black transition ${
                                      status.isActive 
                                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 shadow-2xs' 
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400 line-through border border-slate-200 dark:border-slate-700 opacity-60'
                                    }`}
                                    title={status.isActive ? 'Active Variant' : 'Archived Variant'}
                                  >
                                    ✓
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-300 dark:text-slate-700 text-sm select-none font-sans">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ════════════ 2. CLEAN & DECLUTTERED STYLE VARIANTS MANAGER ════════════ */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-2xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3 text-xs">
              <div className="flex items-center gap-3">
                <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                  Style Variant Inventory & Activation ({inspectedVariants.length} SKUs)
                </span>
                {selectedVariantIds.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold text-[11px]">
                    {selectedVariantIds.length} Selected
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setVariantLayoutMode('grouped')}
                    className={`p-1.5 rounded-lg transition ${
                      variantLayoutMode === 'grouped'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                    title="Colour Grouped Cards View"
                  >
                    <LayoutGrid size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setVariantLayoutMode('compact_list')}
                    className={`p-1.5 rounded-lg transition ${
                      variantLayoutMode === 'compact_list'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                    title="Compact Table View"
                  >
                    <List size={15} />
                  </button>
                </div>

                {selectedVariantIds.length > 0 && (
                  <div className="flex items-center gap-1.5 animate-in fade-in duration-100">
                    <button
                      type="button"
                      onClick={() => handleBulkSetVariantStatus(false)}
                      disabled={bulkActionLoading}
                      className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-bold text-[11px] transition border border-amber-200 dark:border-amber-800"
                    >
                      Deactivate ({selectedVariantIds.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkSetVariantStatus(true)}
                      disabled={bulkActionLoading}
                      className="px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold text-[11px] transition border border-emerald-200 dark:border-emerald-800"
                    >
                      Activate ({selectedVariantIds.length})
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkDeleteVariants}
                      disabled={bulkActionLoading}
                      className="px-2.5 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 font-bold text-[11px] transition border border-red-200 dark:border-red-800"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>

            {variantLayoutMode === 'grouped' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {inspectedVariantsByColour.map(([colourName, vList]) => (
                  <div
                    key={colourName}
                    className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-slate-700/60">
                      <div className="flex items-center gap-2">
                        <span className="w-3.5 h-3.5 rounded-full bg-slate-500 shadow-2xs" />
                        <span className="font-bold text-sm text-slate-900 dark:text-slate-100">{colourName}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({vList.length} sizes)</span>
                      </div>

                      <button
                        type="button"
                        onClick={async () => {
                          const allActive = vList.every(v => v.isActive);
                          for (const v of vList) {
                            await api.updateVariant(v.id, { isActive: !allActive });
                          }
                          await load();
                        }}
                        className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {vList.every(v => v.isActive) ? 'Deactivate All' : 'Activate All'}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {vList.map((v) => (
                        <div
                          key={v.id}
                          className={`p-2.5 rounded-xl border flex flex-col justify-between transition ${
                            v.isActive
                              ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 shadow-2xs'
                              : 'bg-slate-100/70 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 opacity-60'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100 font-sans">
                              {v.size}
                            </span>
                            <button
                              type="button"
                              onClick={async () => {
                                await api.updateVariant(v.id, { isActive: !v.isActive });
                                await load();
                              }}
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md transition ${
                                v.isActive
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300'
                                  : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                              }`}
                            >
                              {v.isActive ? 'Active' : 'Off'}
                            </button>
                          </div>

                          <div className="mt-2 text-[10px] font-mono text-slate-500 truncate">
                            {v.sku}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            Min: {v.minStockQty} pcs
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 font-mono text-[10px] uppercase text-slate-500 tracking-wider">
                      <th className="py-2.5 px-3 w-8 text-center">
                        <input
                          type="checkbox"
                          checked={selectedVariantIds.length > 0 && selectedVariantIds.length === inspectedVariants.length}
                          onChange={handleSelectAllVariants}
                          className="rounded text-blue-600"
                        />
                      </th>
                      <th className="py-2.5 px-3">SKU</th>
                      <th className="py-2.5 px-3">Colour</th>
                      <th className="py-2.5 px-3">Size</th>
                      <th className="py-2.5 px-3 text-right">Min Stock</th>
                      <th className="py-2.5 px-3 text-right">Price Override</th>
                      <th className="py-2.5 px-3 text-center font-sans">Status</th>
                      <th className="py-2.5 px-4 text-right font-sans">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                    {inspectedVariants.map((v) => {
                      const isSelected = selectedVariantIds.includes(v.id);
                      return (
                        <tr key={v.id} className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition ${!v.isActive ? 'opacity-50' : ''}`}>
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectVariant(v.id)}
                              className="rounded text-blue-600"
                            />
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100">{v.sku}</td>
                          <td className="py-2.5 px-3 font-sans">{v.colour}</td>
                          <td className="py-2.5 px-3 font-sans font-bold">{v.size}</td>
                          <td className="py-2.5 px-3 text-right">{v.minStockQty} pcs</td>
                          <td className="py-2.5 px-3 text-right">
                            {v.priceMinor != null ? formatMoney(v.priceMinor, inspectingProduct.defaultCurrency) : 'Default'}
                          </td>
                          <td className="py-2.5 px-3 text-center font-sans">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${v.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200 line-through'}`}>
                              {v.isActive ? 'Active' : 'Archived'}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right font-sans">
                            <button
                              type="button"
                              onClick={async () => {
                                await api.updateVariant(v.id, { isActive: !v.isActive });
                                await load();
                              }}
                              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
                                v.isActive 
                                  ? 'bg-amber-50 hover:bg-amber-100 text-amber-700' 
                                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {v.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ══════════════════ CASE B: MAIN PRODUCT STYLES DIRECTORY ══════════════════ */
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
          {/* Controls Strip */}
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
                <button
                  type="button"
                  onClick={() => setStatusFilter('active')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    statusFilter === 'active' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-bold shadow-2xs' : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Active ({products.filter(p => p.isActive).length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    statusFilter === 'all' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-bold shadow-2xs' : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  All Styles ({products.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('inactive')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    statusFilter === 'inactive' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-bold shadow-2xs' : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Archived ({products.filter(p => !p.isActive).length})
                </button>
              </div>

              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                <input
                  type="text"
                  placeholder="Search code, style, fabric..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 rounded-xl text-xs focus:outline-none focus:border-blue-600"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            <button 
              onClick={openCreate} 
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5"
            >
              <PlusCircle size={14} />
              <span>Add Garment Style</span>
            </button>
          </div>

          {loading ? (
            <div className="py-12 text-center text-slate-400 text-xs">Loading garment styles...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase font-mono text-slate-500 dark:text-slate-400 tracking-wider">
                  <tr>
                    <th className="py-3 pl-3 pr-1 w-8 text-center"></th>
                    <th className="py-3 px-3 w-16">Photo</th>
                    <th className="py-3 px-3 w-28">Style Code</th>
                    <th className="py-3 px-4 min-w-[200px]">Style Name & Fabric Tech</th>
                    <th className="py-3 px-3 text-right w-36">Stitching Rate</th>
                    <th className="py-3 px-3 text-right w-32">Price</th>
                    <th className="py-3 px-3 text-center w-24 font-sans">Status</th>
                    <th className="py-3 px-4 text-right w-36 font-sans">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400 text-xs font-sans">
                        {search ? 'No garment styles match your search query.' : 'No garment styles found. Click "+ Add Garment Style" to begin.'}
                      </td>
                    </tr>
                  ) : filteredProducts.map((p) => {
                    const cover = p.displayImage || p.images?.[0];
                    const imageCount = p.images?.length || (cover ? 1 : 0);
                    const { cleanCategory, meta } = parseProductMetadata(p.category);

                    const isBeingDragged = draggedProdId === p.id;
                    const isDragOverTarget = dragOverProdId === p.id;

                    return (
                      <tr 
                        key={p.id} 
                        draggable={!search}
                        onDragStart={(e) => handleDragStart(e, p.id)}
                        onDragOver={(e) => handleDragOver(e, p.id)}
                        onDrop={(e) => handleDrop(e, p.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => setInspectingProduct(p)}
                        className={`hover:bg-blue-50/40 dark:hover:bg-slate-800/40 transition cursor-pointer ${
                          isBeingDragged ? 'opacity-30 bg-slate-100' : 'opacity-100'
                        } ${
                          isDragOverTarget ? 'border-t-2 border-t-blue-600' : ''
                        }`}
                      >
                        <td className="py-2.5 pl-3 pr-1 text-center" onClick={(e) => e.stopPropagation()}>
                          <div
                            className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 inline-flex items-center justify-center p-0.5 rounded"
                            title="Drag up or down to reorder styles"
                          >
                            <GripVertical size={15} />
                          </div>
                        </td>

                        <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                          {cover ? (
                            <div
                              onClick={() => openLightbox(p, 0)}
                              className="relative group w-11 h-11 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-2xs cursor-pointer bg-slate-100 hover:ring-2 hover:ring-blue-500 transition"
                              title="Click to zoom image"
                            >
                              <img src={cover} alt={p.name} className="w-full h-full object-cover group-hover:scale-110 transition duration-200" />
                              {imageCount > 1 && (
                                <span className="absolute bottom-0 right-0 bg-slate-900/80 text-[9px] font-extrabold text-white px-1 rounded-tl-md">
                                  {imageCount}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div
                              onClick={() => openEdit(p)}
                              className="w-11 h-11 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center text-slate-400 hover:text-blue-600 transition cursor-pointer"
                              title="Upload style photo"
                            >
                              <ImageIcon size={14} />
                              <span className="text-[8px] font-bold mt-0.5">+img</span>
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-3 font-mono font-bold text-xs text-blue-600 dark:text-blue-400 whitespace-nowrap">
                          {p.code}
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-bold text-sm text-slate-900 dark:text-slate-100">
                            {p.name}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            {cleanCategory && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                                {cleanCategory}
                              </span>
                            )}
                            {meta.techSpecs && (
                              <span className="text-[11px] text-slate-500 italic">
                                • {meta.techSpecs}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right font-mono font-bold text-xs">
                          {meta.stitchingRateMinor != null ? (
                            <span className="text-purple-600 dark:text-purple-400">
                              {formatMoney(meta.stitchingRateMinor, 'NPR')}
                              <span className="text-[10px] text-slate-400 font-sans font-normal block">per piece</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Not set</span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-right font-mono font-bold text-xs text-slate-900 dark:text-slate-100">
                          {p.defaultPriceMinor ? (
                            formatMoney(p.defaultPriceMinor, p.defaultCurrency)
                          ) : (
                            '—'
                          )}
                        </td>

                        <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            p.isActive 
                              ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' 
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 line-through'
                          }`}>
                            {p.isActive ? 'Active' : 'Archived'}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap font-sans" onClick={(e) => e.stopPropagation()}>
                          <button 
                            type="button"
                            onClick={() => setInspectingProduct(p)} 
                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-xs font-bold rounded-lg transition"
                          >
                            Details
                          </button>
                          <button 
                            type="button"
                            onClick={() => openEdit(p)} 
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-lg transition"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── MODAL: ADD / EDIT GARMENT STYLE ─── */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 my-8 text-xs">
            <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h4 className="font-extrabold text-base text-slate-900 dark:text-slate-100">
                  {editProduct ? 'Edit Garment Style' : 'Add New Garment Style'}
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure style code, stitching labor rate, fabric specs, and product photos.
                </p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white font-bold p-1">
                ✕
              </button>
            </div>

            {error && <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-semibold">{error}</div>}

            <form onSubmit={handleSave} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">Style Code *</label>
                  <input
                    value={form.code}
                    onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                    placeholder="e.g. JKT-01, HD-04"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl font-mono font-bold text-sm focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">Style Name *</label>
                  <input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Heavyweight Fleece Hoodie"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl font-semibold text-sm focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">Garment Category</label>
                  <input
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    placeholder="e.g. Hoodies, Jackets, Cargo Pants"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-purple-700 dark:text-purple-400 font-bold mb-1">
                    Stitching Labor Rate (Rs.)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={form.stitchingRateMinor}
                    onChange={e => setForm(f => ({ ...f, stitchingRateMinor: e.target.value }))}
                    placeholder="e.g. 65.00"
                    className="w-full px-3 py-2 border border-purple-300 dark:border-purple-800 bg-purple-50/30 dark:bg-purple-950/20 text-purple-900 dark:text-purple-200 rounded-xl font-mono font-bold text-sm focus:outline-none focus:border-purple-600"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Default labor pay per finished piece</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  Fabric & Cutting Technical Specs
                </label>
                <input
                  value={form.techSpecs}
                  onChange={e => setForm(f => ({ ...f, techSpecs: e.target.value }))}
                  placeholder="e.g. 320 GSM Cotton Fleece • ~0.75 kg/pc • YKK #5 Metal Zipper"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">Default Price (Rs.)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.defaultPriceMinor}
                    onChange={e => setForm(f => ({ ...f, defaultPriceMinor: e.target.value }))}
                    placeholder="e.g. 1450.00"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl font-mono text-sm font-bold focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">Currency</label>
                  <select
                    value={form.defaultCurrency}
                    onChange={e => setForm(f => ({ ...f, defaultCurrency: e.target.value as Currency }))}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm font-bold focus:border-blue-500 focus:outline-none"
                  >
                    <option value="NPR">NPR (Rs.)</option>
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
              </div>

              {/* Images */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <label className="block text-slate-800 dark:text-slate-200 font-bold">
                      Style Photos ({form.images.length}/4)
                    </label>
                    <p className="text-[10px] text-slate-400">
                      Upload up to 4 images. Click any photo to select the display cover.
                    </p>
                  </div>
                  {form.images.length < 4 && (
                    <button
                      type="button"
                      onClick={() => setShowUrlInput(!showUrlInput)}
                      className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold"
                    >
                      {showUrlInput ? 'Cancel URL' : '+ Add from URL'}
                    </button>
                  )}
                </div>

                {showUrlInput && form.images.length < 4 && (
                  <div className="flex gap-2 mb-3 bg-slate-50 dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                    <input
                      type="url"
                      placeholder="Paste image URL (https://...)"
                      value={urlInput}
                      onChange={e => setUrlInput(e.target.value)}
                      className="flex-1 px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-900 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddUrl}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold"
                    >
                      Add
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-4 gap-3">
                  {form.images.map((img, idx) => {
                    const isDisplay = form.displayImage === img || (idx === 0 && !form.displayImage);
                    return (
                      <div
                        key={idx}
                        className={`relative group aspect-square rounded-xl overflow-hidden border-2 bg-slate-100 dark:bg-slate-800 transition shadow-2xs ${
                          isDisplay ? 'border-emerald-500 ring-2 ring-emerald-200 dark:ring-emerald-900' : 'border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <img src={img} alt={`Style ${idx + 1}`} className="w-full h-full object-cover" />
                        {isDisplay ? (
                          <span className="absolute top-1.5 left-1.5 bg-emerald-600 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-md shadow-sm">
                            ★ Display
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSetDisplay(img)}
                            className="absolute top-1.5 left-1.5 bg-slate-900/75 hover:bg-emerald-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md opacity-0 group-hover:opacity-100 transition shadow-sm"
                          >
                            Cover
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(idx)}
                          className="absolute top-1.5 right-1.5 bg-red-600 hover:bg-red-700 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold opacity-0 group-hover:opacity-100 transition shadow-sm"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}

                  {form.images.length < 4 && (
                    <label
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={(e) => {
                        e.preventDefault(); e.stopPropagation();
                        if (e.dataTransfer.files) handleFilesSelected(e.dataTransfer.files);
                      }}
                      className={`aspect-square rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-2 text-center cursor-pointer transition ${
                        uploadingImage ? 'opacity-50 pointer-events-none' : ''
                      }`}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          if (e.dataTransfer?.files || e.target.files) handleFilesSelected(e.target.files!);
                        }}
                      />
                      <ImageIcon className="w-5 h-5 text-slate-400 mb-1" />
                      <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">
                        {uploadingImage ? 'Processing...' : 'Upload'}
                      </span>
                      <span className="text-[9px] text-slate-400">({4 - form.images.length} left)</span>
                    </label>
                  )}
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)} 
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={saving || uploadingImage} 
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editProduct ? 'Update Style' : 'Create Style'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Set Price Modal */}
      {showPriceModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-3">
              <h4 className="font-extrabold text-base text-slate-900 dark:text-slate-100">Update Style Price</h4>
              <button onClick={() => setShowPriceModal(false)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>
            <form onSubmit={handleSetPrice} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">New Price (Rs.)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  min="0.01" 
                  value={priceForm.priceMinor} 
                  onChange={e => setPriceForm(f => ({ ...f, priceMinor: e.target.value }))} 
                  placeholder="e.g. 1450.00" 
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm font-mono font-bold" 
                  required 
                />
              </div>
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">Reason / Note (Optional)</label>
                <input 
                  value={priceForm.note} 
                  onChange={e => setPriceForm(f => ({ ...f, note: e.target.value }))} 
                  placeholder="e.g. Revised standard rate" 
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl" 
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setShowPriceModal(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white">Save Price</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-4">
          <div className="relative max-w-2xl w-full bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-800 flex flex-col">
            <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between text-white">
              <div>
                <h4 className="font-bold text-sm">{lightboxProduct.name}</h4>
                <p className="text-[11px] text-slate-400 font-mono">{lightboxProduct.code} — Photo {(lightboxIndex + 1)} of {(lightboxProduct.images?.length || 1)}</p>
              </div>
              <button
                onClick={() => setLightboxProduct(null)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 hover:text-white font-bold transition"
              >
                ✕
              </button>
            </div>

            <div className="relative aspect-4/3 max-h-[60vh] bg-black flex items-center justify-center p-4">
              {(() => {
                const images = lightboxProduct.images && lightboxProduct.images.length > 0
                  ? lightboxProduct.images
                  : [lightboxProduct.displayImage || ''];
                const currentImg = images[lightboxIndex] || images[0];

                return (
                  <>
                    <img src={currentImg} alt={lightboxProduct.name} className="max-h-full max-w-full object-contain rounded-lg" />
                    {images.length > 1 && (
                      <>
                        <button
                          onClick={() => setLightboxIndex((lightboxIndex - 1 + images.length) % images.length)}
                          className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center font-bold text-lg"
                        >
                          ‹
                        </button>
                        <button
                          onClick={() => setLightboxIndex((lightboxIndex + 1) % images.length)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center font-bold text-lg"
                        >
                          ›
                        </button>
                      </>
                    )}
                  </>
                );
              })()}
            </div>

            {lightboxProduct.images && lightboxProduct.images.length > 1 && (
              <div className="p-3 bg-slate-900 border-t border-slate-800 flex justify-center gap-2">
                {lightboxProduct.images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setLightboxIndex(idx)}
                    className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition ${
                      lightboxIndex === idx ? 'border-blue-500 scale-105' : 'border-slate-700 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Variants Panel (Colour × Size Matrix Generator & Manager) ──────────────────

interface VariantsPanelProps {
  openConfirmDialog: (config: Omit<CustomDialogState, 'isOpen'>) => void;
}

const VariantsPanel: React.FC<VariantsPanelProps> = ({ openConfirmDialog }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [colours, setColours] = useState<Colour[]>([]);
  const [sizes, setSizes] = useState<Size[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [selectedColours, setSelectedColours] = useState<number[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<number[]>([]);
  const [minStockQty, setMinStockQty] = useState<number>(0);
  const [openingStockQty, setOpeningStockQty] = useState<number>(0);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ created: number[]; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Layout mode: 'grouped' (Colour-Grouped Cards) vs 'compact_list' (Table)
  const [variantLayoutMode, setVariantLayoutMode] = useState<'grouped' | 'compact_list'>('grouped');
  const [selectedVariantIds, setSelectedVariantIds] = useState<number[]>([]);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  const [variantSearch, setVariantSearch] = useState('');
  const [editVariant, setEditVariant] = useState<ProductVariant | null>(null);
  const [editMinStock, setEditMinStock] = useState('0');
  const [editPrice, setEditPrice] = useState('');

  const loadVariants = async () => {
    if (selectedProductId) {
      const v = await api.getVariants(selectedProductId);
      setVariants(v.variants || []);
    }
  };

  useEffect(() => {
    Promise.all([api.getProducts(), api.getColours(), api.getSizes()])
      .then(([p, c, s]) => {
        const activeProds = p.products.filter(prod => prod.isActive);
        setProducts(activeProds);
        setColours(c.colours.filter(col => col.isActive));
        setSizes(s.sizes.filter(sz => sz.isActive).sort((a, b) => a.sortOrder - b.sortOrder));
        if (activeProds.length > 0) setSelectedProductId(activeProds[0].id);
      });
  }, []);

  useEffect(() => {
    if (selectedProductId) loadVariants();
  }, [selectedProductId]);

  const toggleColour = (id: number) => setSelectedColours(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  const toggleSize = (id: number) => setSelectedSizes(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);

  const selectAllColours = () => setSelectedColours(colours.map(c => c.id));
  const clearColours = () => setSelectedColours([]);

  const selectAllSizes = () => setSelectedSizes(sizes.map(s => s.id));
  const clearSizes = () => setSelectedSizes([]);

  const handleGenerate = async () => {
    if (!selectedProductId || selectedColours.length === 0 || selectedSizes.length === 0) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.generateVariants(
        selectedProductId,
        selectedColours,
        selectedSizes,
        minStockQty || undefined,
        openingStockQty || undefined
      );
      setResult(r);
      setSelectedColours([]);
      setSelectedSizes([]);
      await loadVariants();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleToggleActive = (variant: ProductVariant) => {
    const action = variant.isActive ? 'Deactivate' : 'Reactivate';
    openConfirmDialog({
      title: `${action} Variant SKU`,
      message: `Are you sure you want to ${action.toLowerCase()} SKU "${variant.sku}"?`,
      confirmText: action,
      isDestructive: variant.isActive,
      onConfirm: async () => {
        try {
          await api.updateVariant(variant.id, { isActive: !variant.isActive });
          await loadVariants();
        } catch (e: any) { setError(e.message); }
      },
    });
  };

  const handleDeleteVariant = (v: ProductVariant) => {
    openConfirmDialog({
      title: 'Permanently Delete Variant SKU',
      message: `Permanently delete SKU "${v.sku}"?\n\nIf this SKU has past stock records or orders, it cannot be deleted and should be deactivated instead.`,
      confirmText: 'Delete Permanently',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await api.deleteVariant(v.id);
          await loadVariants();
        } catch (e: any) { setError(e.message); }
      },
    });
  };

  const openEditVariant = (v: ProductVariant) => {
    setEditVariant(v);
    setEditMinStock(String(v.minStockQty));
    setEditPrice(v.priceMinor != null ? (v.priceMinor / 100).toFixed(2) : '');
  };

  const handleSaveVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editVariant) return;
    const minStock = parseInt(editMinStock, 10);
    const priceMinor = editPrice.trim() === '' ? null : Math.round(parseFloat(editPrice) * 100);
    try {
      await api.updateVariant(editVariant.id, {
        minStockQty: isNaN(minStock) ? 0 : minStock,
        priceMinor,
      });
      setEditVariant(null);
      await loadVariants();
    } catch (e: any) { setError(e.message); }
  };

  const currentProduct = products.find(p => p.id === selectedProductId);
  const { meta: currentMeta } = parseProductMetadata(currentProduct?.category);

  const filteredVariants = useMemo(() => {
    return variants.filter(v => {
      if (!showInactive && !v.isActive) return false;
      const q = variantSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        v.sku.toLowerCase().includes(q) ||
        v.colour.toLowerCase().includes(q) ||
        v.size.toLowerCase().includes(q)
      );
    });
  }, [variants, showInactive, variantSearch]);

  // Group variants by colour
  const variantsByColour = useMemo(() => {
    const map = new Map<string, ProductVariant[]>();
    filteredVariants.forEach(v => {
      const current = map.get(v.colour) || [];
      current.push(v);
      map.set(v.colour, current);
    });
    return Array.from(map.entries());
  }, [filteredVariants]);

  // Bulk Variant Action Handlers
  const handleSelectAllVariants = () => {
    if (selectedVariantIds.length === filteredVariants.length) {
      setSelectedVariantIds([]);
    } else {
      setSelectedVariantIds(filteredVariants.map(v => v.id));
    }
  };

  const handleToggleSelectVariant = (id: number) => {
    setSelectedVariantIds(prev => prev.includes(id) ? prev.filter(vId => vId !== id) : [...prev, id]);
  };

  const handleBulkSetVariantStatus = (targetActive: boolean) => {
    if (selectedVariantIds.length === 0) return;
    const actionLabel = targetActive ? 'Activate' : 'Deactivate';

    openConfirmDialog({
      title: `${actionLabel} Selected Variants`,
      message: `Are you sure you want to ${actionLabel.toLowerCase()} ${selectedVariantIds.length} selected SKU variant(s)?`,
      confirmText: actionLabel,
      isDestructive: !targetActive,
      onConfirm: async () => {
        try {
          setBulkActionLoading(true);
          for (const vId of selectedVariantIds) {
            await api.updateVariant(vId, { isActive: targetActive });
          }
          setSelectedVariantIds([]);
          await loadVariants();
        } catch (err: any) {
          setError(err.message || 'Failed to update some variants');
        } finally {
          setBulkActionLoading(false);
        }
      },
    });
  };

  const handleBulkDeleteVariants = () => {
    if (selectedVariantIds.length === 0) return;

    openConfirmDialog({
      title: 'Delete Selected Variants',
      message: `Are you sure you want to permanently delete ${selectedVariantIds.length} selected SKU variant(s)?\n\nNote: SKUs with past order or stock history cannot be deleted and should be deactivated instead.`,
      confirmText: 'Delete Selected',
      isDestructive: true,
      onConfirm: async () => {
        try {
          setBulkActionLoading(true);
          for (const vId of selectedVariantIds) {
            await api.deleteVariant(vId);
          }
          setSelectedVariantIds([]);
          await loadVariants();
        } catch (err: any) {
          setError(err.message || 'Failed to delete some variants');
        } finally {
          setBulkActionLoading(false);
        }
      },
    });
  };

  return (
    <div className="space-y-5">
      {/* Matrix Auto-Generator Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
              Matrix Auto-Generator (Colour × Size)
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Pick the garment style, check your available floor colors & sizes, and generate all SKUs instantly.
            </p>
          </div>
          {currentMeta.stitchingRateMinor != null && (
            <div className="px-3 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 font-mono text-xs font-bold">
              Stitching Labor Rate: {formatMoney(currentMeta.stitchingRateMinor, 'NPR')}/pc
            </div>
          )}
        </div>

        <div className="p-6 space-y-5 text-xs">
          {error && <div className="p-3 bg-red-50 text-red-700 rounded-xl font-semibold">{error}</div>}
          {result && (
            <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl font-semibold border border-emerald-200 flex items-center gap-2">
              <CheckCircle2 size={16} />
              <span>
                Generated {result.created.length} new SKU{result.created.length !== 1 ? 's' : ''}
                {openingStockQty > 0 && <> with {openingStockQty} pcs initial finished stock</>}
                {result.skipped > 0 && <> • {result.skipped} existing SKUs skipped</>}
              </span>
            </div>
          )}

          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1.5 uppercase tracking-wider text-[11px]">
              1. Select Garment Style
            </label>
            <select
              value={selectedProductId ?? ''}
              onChange={e => setSelectedProductId(Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm font-semibold focus:outline-none focus:border-blue-600"
            >
              {products.map(p => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                  2. Choose Colours ({selectedColours.length}/{colours.length})
                </span>
                <div className="space-x-2 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                  <button type="button" onClick={selectAllColours} className="hover:underline">All</button>
                  <span>•</span>
                  <button type="button" onClick={clearColours} className="hover:underline">Clear</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {colours.map(c => (
                  <label
                    key={c.id}
                    className={`flex items-center space-x-2 p-2 rounded-xl cursor-pointer border transition ${
                      selectedColours.includes(c.id)
                        ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-400 text-blue-900 dark:text-blue-200'
                        : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedColours.includes(c.id)}
                      onChange={() => toggleColour(c.id)}
                      className="rounded text-blue-600"
                    />
                    <span className="font-semibold truncate">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                  3. Choose Size Scales ({selectedSizes.length}/{sizes.length})
                </span>
                <div className="space-x-2 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                  <button type="button" onClick={selectAllSizes} className="hover:underline">All</button>
                  <span>•</span>
                  <button type="button" onClick={clearSizes} className="hover:underline">Clear</button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                {sizes.map(s => (
                  <label
                    key={s.id}
                    onClick={() => toggleSize(s.id)}
                    className={`flex items-center justify-center p-2 rounded-xl cursor-pointer border transition text-sm font-extrabold select-none ${
                      selectedSizes.includes(s.id)
                        ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                    }`}
                  >
                    {s.name}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">Initial Finished Stock per SKU</label>
              <input
                type="number"
                min="0"
                value={openingStockQty === 0 ? '' : openingStockQty}
                placeholder="0 pcs"
                onChange={e => setOpeningStockQty(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl font-semibold focus:outline-none focus:border-blue-600"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">Finished units added directly to inventory on creation</span>
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">Minimum Alert Threshold</label>
              <input
                type="number"
                min="0"
                value={minStockQty === 0 ? '' : minStockQty}
                placeholder="0 pcs"
                onChange={e => setMinStockQty(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl font-semibold focus:outline-none focus:border-blue-600"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">Triggers low-stock warning banners when inventory drops below this</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <span className="text-xs text-slate-500 font-semibold">
              {selectedColours.length} colours × {selectedSizes.length} sizes ={' '}
              <span className="font-bold text-blue-600 dark:text-blue-400">
                {selectedColours.length * selectedSizes.length} total SKUs
              </span>
            </span>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating || !selectedProductId || selectedColours.length === 0 || selectedSizes.length === 0}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs disabled:opacity-50 transition"
            >
              {generating ? 'Generating SKUs...' : `Generate ${selectedColours.length * selectedSizes.length} Matrix SKUs`}
            </button>
          </div>
        </div>
      </div>

      {/* ════════════ REPLACED: NEW CLEAN COLOUR-GROUPED CARDS MANAGER ════════════ */}
      {selectedProductId && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3 text-xs">
            <div className="flex items-center gap-3">
              <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                Matrix SKUs for {currentProduct?.code || 'Product'} ({variants.length})
              </span>
              {selectedVariantIds.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold text-[11px]">
                  {selectedVariantIds.length} Selected
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  placeholder="Filter color or size..."
                  value={variantSearch}
                  onChange={e => setVariantSearch(e.target.value)}
                  className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 rounded-xl text-xs w-44 focus:outline-none focus:border-blue-600"
                />
                <label className="flex items-center space-x-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showInactive}
                    onChange={e => setShowInactive(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span className="text-slate-600 dark:text-slate-400 font-semibold text-[11px]">Inactive</span>
                </label>
              </div>

              {/* View Mode Switcher */}
              <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setVariantLayoutMode('grouped')}
                  className={`p-1.5 rounded-lg transition ${
                    variantLayoutMode === 'grouped'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="Colour Grouped Cards View"
                >
                  <LayoutGrid size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setVariantLayoutMode('compact_list')}
                  className={`p-1.5 rounded-lg transition ${
                    variantLayoutMode === 'compact_list'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="Compact Table View"
                >
                  <List size={15} />
                </button>
              </div>

              {selectedVariantIds.length > 0 && (
                <div className="flex items-center gap-1.5 animate-in fade-in duration-100">
                  <button
                    type="button"
                    onClick={() => handleBulkSetVariantStatus(false)}
                    disabled={bulkActionLoading}
                    className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-bold text-[11px] transition border border-amber-200 dark:border-amber-800"
                  >
                    Deactivate ({selectedVariantIds.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkSetVariantStatus(true)}
                    disabled={bulkActionLoading}
                    className="px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold text-[11px] transition border border-emerald-200 dark:border-emerald-800"
                  >
                    Activate ({selectedVariantIds.length})
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkDeleteVariants}
                    disabled={bulkActionLoading}
                    className="px-2.5 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 font-bold text-[11px] transition border border-red-200 dark:border-red-800"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* VIEW OPTION 1: COLOUR-GROUPED TILES */}
          {variantLayoutMode === 'grouped' ? (
            filteredVariants.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-xs font-sans">
                {variants.length === 0 ? 'No SKUs generated yet for this style. Use the generator above.' : 'No SKUs match the filter.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {variantsByColour.map(([colourName, vList]) => (
                  <div
                    key={colourName}
                    className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-slate-700/60">
                      <div className="flex items-center gap-2">
                        <span className="w-3.5 h-3.5 rounded-full bg-slate-500 shadow-2xs" />
                        <span className="font-bold text-sm text-slate-900 dark:text-slate-100">{colourName}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({vList.length} sizes)</span>
                      </div>

                      <button
                        type="button"
                        onClick={async () => {
                          const allActive = vList.every(v => v.isActive);
                          for (const v of vList) {
                            await api.updateVariant(v.id, { isActive: !allActive });
                          }
                          await loadVariants();
                        }}
                        className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {vList.every(v => v.isActive) ? 'Deactivate All' : 'Activate All'}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {vList.map((v) => (
                        <div
                          key={v.id}
                          className={`p-2.5 rounded-xl border flex flex-col justify-between transition ${
                            v.isActive
                              ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 shadow-2xs'
                              : 'bg-slate-100/70 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 opacity-60'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100 font-sans">
                              {v.size}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditVariant(v)}
                                className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300"
                                title="Edit min stock and price override"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await api.updateVariant(v.id, { isActive: !v.isActive });
                                  await loadVariants();
                                }}
                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md transition ${
                                  v.isActive
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300'
                                    : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                                }`}
                              >
                                {v.isActive ? 'Active' : 'Off'}
                              </button>
                            </div>
                          </div>

                          <div className="mt-2 text-[10px] font-mono text-slate-500 truncate">
                            {v.sku}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            Min: {v.minStockQty} pcs
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            /* VIEW OPTION 2: COMPACT TABLE */
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 font-mono text-[10px] uppercase text-slate-500 tracking-wider">
                    <th className="py-2.5 px-3 w-8 text-center">
                      <input
                        type="checkbox"
                        checked={selectedVariantIds.length > 0 && selectedVariantIds.length === filteredVariants.length}
                        onChange={handleSelectAllVariants}
                        className="rounded text-blue-600"
                      />
                    </th>
                    <th className="py-2.5 px-3">SKU</th>
                    <th className="py-2.5 px-3">Colour</th>
                    <th className="py-2.5 px-3">Size</th>
                    <th className="py-2.5 px-3 text-right">Min Stock</th>
                    <th className="py-2.5 px-3 text-right">Price Override</th>
                    <th className="py-2.5 px-3 text-center font-sans">Status</th>
                    <th className="py-2.5 px-4 text-right font-sans">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {filteredVariants.map((v) => {
                    const isSelected = selectedVariantIds.includes(v.id);
                    return (
                      <tr key={v.id} className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition ${!v.isActive ? 'opacity-50' : ''}`}>
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectVariant(v.id)}
                            className="rounded text-blue-600"
                          />
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100">{v.sku}</td>
                        <td className="py-2.5 px-3 font-sans">{v.colour}</td>
                        <td className="py-2.5 px-3 font-sans font-bold">{v.size}</td>
                        <td className="py-2.5 px-3 text-right">{v.minStockQty} pcs</td>
                        <td className="py-2.5 px-3 text-right">
                          {v.priceMinor != null ? formatMoney(v.priceMinor, currentProduct?.defaultCurrency) : 'Default'}
                        </td>
                        <td className="py-2.5 px-3 text-center font-sans">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${v.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200 line-through'}`}>
                            {v.isActive ? 'Active' : 'Archived'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right space-x-1.5 whitespace-nowrap font-sans">
                          <button
                            type="button"
                            onClick={() => openEditVariant(v)}
                            className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-bold rounded"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(v)}
                            className={`px-2 py-0.5 text-[11px] font-semibold rounded ${
                              v.isActive ? 'bg-amber-50 hover:bg-amber-100 text-amber-700' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {v.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteVariant(v)}
                            className="px-2 py-0.5 bg-red-50 hover:bg-red-100 text-red-700 text-[11px] font-bold rounded"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal: Edit Variant */}
      {editVariant && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
              <div>
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">Edit SKU Variant</h4>
                <p className="text-[11px] font-mono text-slate-500 mt-0.5">{editVariant.sku}</p>
              </div>
              <button onClick={() => setEditVariant(null)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>
            <form onSubmit={handleSaveVariant} className="space-y-3">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">Minimum Stock Alert Threshold (pcs)</label>
                <input
                  type="number"
                  min="0"
                  value={editMinStock}
                  onChange={e => setEditMinStock(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm font-semibold focus:outline-none focus:border-blue-600"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">Price Override (Optional)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editPrice}
                  onChange={e => setEditPrice(e.target.value)}
                  placeholder="Leave empty to use style default price"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm font-semibold focus:outline-none focus:border-blue-600"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Clear field to fallback to the default garment style price.
                </span>
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button type="button" onClick={() => setEditVariant(null)} className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" className="px-4 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Unified Colours & Sizes Panel (Single Unified Side) ─────────────────────────

interface ColoursAndSizesPanelProps {
  openConfirmDialog: (config: Omit<CustomDialogState, 'isOpen'>) => void;
}

const ColoursAndSizesPanel: React.FC<ColoursAndSizesPanelProps> = ({ openConfirmDialog }) => {
  // Colour state
  const [colours, setColours] = useState<Colour[]>([]);
  const [newColourName, setNewColourName] = useState('');
  const [editColour, setEditColour] = useState<Colour | null>(null);
  const [editColourName, setEditColourName] = useState('');

  // Size state
  const [sizes, setSizes] = useState<Size[]>([]);
  const [newSizeName, setNewSizeName] = useState('');
  const [newSortOrder, setNewSortOrder] = useState('');
  const [editSize, setEditSize] = useState<Size | null>(null);
  const [editSizeForm, setEditSizeForm] = useState({ name: '', sortOrder: '' });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [colRes, sizeRes] = await Promise.all([api.getColours(), api.getSizes()]);
      setColours(colRes.colours || []);
      setSizes((sizeRes.sizes || []).sort((a, b) => a.sortOrder - b.sortOrder));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // Colour actions
  const handleAddColour = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColourName.trim()) return;
    setSaving(true);
    try {
      await api.createColour(newColourName.trim());
      setNewColourName('');
      await loadData();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleUpdateColour = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editColour || !editColourName.trim()) return;
    setSaving(true);
    try {
      await api.updateColour(editColour.id, { name: editColourName.trim() });
      setEditColour(null);
      await loadData();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleToggleColour = (c: Colour) => {
    const action = c.isActive ? 'Deactivate' : 'Reactivate';
    openConfirmDialog({
      title: `${action} Floor Colour`,
      message: `Are you sure you want to ${action.toLowerCase()} colour "${c.name}"?`,
      confirmText: action,
      isDestructive: c.isActive,
      onConfirm: async () => {
        try {
          await api.updateColour(c.id, { isActive: !c.isActive });
          await loadData();
        } catch (e: any) { setError(e.message); }
      },
    });
  };

  const handleDeleteColour = (c: Colour) => {
    openConfirmDialog({
      title: 'Permanently Delete Colour',
      message: `Permanently delete colour "${c.name}"?\n\nIf this colour is used by existing variants, deactivate it instead.`,
      confirmText: 'Delete Permanently',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await api.deleteColour(c.id);
          await loadData();
        } catch (e: any) { setError(e.message); }
      },
    });
  };

  // Size actions
  const handleAddSize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSizeName.trim() || !newSortOrder.trim()) return;
    setSaving(true);
    try {
      await api.createSize(newSizeName.trim(), Number(newSortOrder));
      setNewSizeName('');
      setNewSortOrder('');
      await loadData();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleUpdateSize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSize || !editSizeForm.name.trim()) return;
    setSaving(true);
    try {
      await api.updateSize(editSize.id, {
        name: editSizeForm.name.trim(),
        sortOrder: Number(editSizeForm.sortOrder) || 0,
      });
      setEditSize(null);
      await loadData();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleToggleSize = (s: Size) => {
    const action = s.isActive ? 'Deactivate' : 'Reactivate';
    openConfirmDialog({
      title: `${action} Size Scale`,
      message: `Are you sure you want to ${action.toLowerCase()} size "${s.name}"?`,
      confirmText: action,
      isDestructive: s.isActive,
      onConfirm: async () => {
        try {
          await api.updateSize(s.id, { isActive: !s.isActive });
          await loadData();
        } catch (e: any) { setError(e.message); }
      },
    });
  };

  const handleDeleteSize = (s: Size) => {
    openConfirmDialog({
      title: 'Permanently Delete Size',
      message: `Permanently delete size "${s.name}"?`,
      confirmText: 'Delete Permanently',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await api.deleteSize(s.id);
          await loadData();
        } catch (e: any) { setError(e.message); }
      },
    });
  };

  return (
    <div className="space-y-4">
      {error && <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-semibold">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* COLUMN 1: FLOOR COLOURS */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Palette size={16} className="text-blue-600 dark:text-blue-400" />
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">Floor Colours ({colours.length})</h4>
              </div>
            </div>

            <div className="p-4 space-y-3.5 text-xs">
              <form onSubmit={handleAddColour} className="flex gap-2">
                <input
                  value={newColourName}
                  onChange={e => setNewColourName(e.target.value)}
                  placeholder="New colour (e.g. Navy Blue, Maroon)"
                  className="flex-1 px-3 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl font-semibold focus:outline-none focus:border-blue-600"
                  required
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs transition"
                >
                  + Add
                </button>
              </form>

              {loading ? (
                <div className="py-8 text-center text-slate-400">Loading colours...</div>
              ) : (
                <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                  {colours.map((c) => (
                    <div
                      key={c.id}
                      className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <span className="w-3.5 h-3.5 rounded-full bg-slate-400 dark:bg-slate-500 shadow-2xs shrink-0" />
                        <span className={`font-semibold truncate ${c.isActive ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400 line-through'}`}>
                          {c.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => { setEditColour(c); setEditColourName(c.name); }}
                          className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-bold"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleColour(c)}
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            c.isActive ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {c.isActive ? 'Off' : 'On'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteColour(c)}
                          className="p-1 text-rose-600 hover:bg-rose-50 rounded"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* COLUMN 2: SIZE SCALES */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ruler size={16} className="text-blue-600 dark:text-blue-400" />
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">Size Scales ({sizes.length})</h4>
              </div>
            </div>

            <div className="p-4 space-y-3.5 text-xs">
              <form onSubmit={handleAddSize} className="flex gap-2">
                <input
                  value={newSizeName}
                  onChange={e => setNewSizeName(e.target.value)}
                  placeholder="Size (e.g. XL, 3XL)"
                  className="flex-1 px-3 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl font-semibold focus:outline-none focus:border-blue-600"
                  required
                />
                <input
                  type="number"
                  value={newSortOrder}
                  onChange={e => setNewSortOrder(e.target.value)}
                  placeholder="Seq #"
                  className="w-20 px-2 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl font-semibold focus:outline-none focus:border-blue-600 text-center"
                  required
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs transition"
                >
                  + Add
                </button>
              </form>

              {loading ? (
                <div className="py-8 text-center text-slate-400">Loading sizes...</div>
              ) : (
                <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                  {sizes.map((s) => (
                    <div
                      key={s.id}
                      className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100 font-sans">
                          {s.name}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800">
                          #{s.sortOrder}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => { setEditSize(s); setEditSizeForm({ name: s.name, sortOrder: String(s.sortOrder) }); }}
                          className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-bold"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleSize(s)}
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            s.isActive ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {s.isActive ? 'Off' : 'On'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSize(s)}
                          className="p-1 text-rose-600 hover:bg-rose-50 rounded"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Colour Modal */}
      {editColour && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
              <h4 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">Edit Floor Colour</h4>
              <button onClick={() => setEditColour(null)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>
            <form onSubmit={handleUpdateColour} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Colour Name</label>
                <input
                  value={editColourName}
                  onChange={e => setEditColourName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm font-semibold focus:outline-none focus:border-blue-600"
                  required
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button type="button" onClick={() => setEditColour(null)} className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Size Modal */}
      {editSize && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
              <h4 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">Edit Size Scale</h4>
              <button onClick={() => setEditSize(null)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>
            <form onSubmit={handleUpdateSize} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Size Name</label>
                <input
                  value={editSizeForm.name}
                  onChange={e => setEditSizeForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm font-semibold focus:outline-none focus:border-blue-600"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Sequence Sort Order</label>
                <input
                  type="number"
                  value={editSizeForm.sortOrder}
                  onChange={e => setEditSizeForm(f => ({ ...f, sortOrder: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm font-semibold focus:outline-none focus:border-blue-600"
                  required
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button type="button" onClick={() => setEditSize(null)} className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};