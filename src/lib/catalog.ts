import { prisma } from "./prisma";
import {
  ALL_PRODUCT_KEYS,
  PRODUCTS_META,
  PIPELINE_TEMPLATES,
  stageIdFor,
} from "./products";

/**
 * Idempotent catalog bootstrap: upserts the Product, Pipeline and
 * PipelineStage rows from the templates. Safe to run repeatedly (used by the
 * seed and by a runtime fallback when the catalog is empty).
 */
export async function ensureCatalog() {
  for (let i = 0; i < ALL_PRODUCT_KEYS.length; i++) {
    const key = ALL_PRODUCT_KEYS[i];
    const meta = PRODUCTS_META[key];
    await prisma.product.upsert({
      where: { key },
      update: { name: meta.label, description: meta.description, displayOrder: i },
      create: {
        key,
        name: meta.label,
        description: meta.description,
        displayOrder: i,
        active: key !== "UNASSIGNED",
      },
    });
  }

  for (const t of PIPELINE_TEMPLATES) {
    await prisma.pipeline.upsert({
      where: { id: t.id },
      update: { name: t.name, productKey: t.productKey },
      create: { id: t.id, name: t.name, productKey: t.productKey },
    });
    for (let i = 0; i < t.stages.length; i++) {
      const s = t.stages[i];
      const id = stageIdFor(t.id, s.key);
      await prisma.pipelineStage.upsert({
        where: { id },
        update: {
          name: s.name,
          order: i,
          defaultProbability: s.probability,
          isWon: s.isWon ?? false,
          isLost: s.isLost ?? false,
        },
        create: {
          id,
          key: s.key,
          name: s.name,
          order: i,
          defaultProbability: s.probability,
          isWon: s.isWon ?? false,
          isLost: s.isLost ?? false,
          pipelineId: t.id,
        },
      });
    }
  }
}

export type PipelineWithStages = Awaited<ReturnType<typeof getPipelines>>[number];

/** All pipelines with ordered stages, bootstrapping the catalog if empty. */
export async function getPipelines() {
  let pipelines = await prisma.pipeline.findMany({
    include: { stages: { orderBy: { order: "asc" } }, product: true },
    orderBy: { id: "asc" },
  });
  if (pipelines.length === 0) {
    await ensureCatalog();
    pipelines = await prisma.pipeline.findMany({
      include: { stages: { orderBy: { order: "asc" } }, product: true },
      orderBy: { id: "asc" },
    });
  }
  return pipelines;
}

/** Default (first active) pipeline for a product key. */
export async function getPipelineForProduct(productKey: string) {
  const pipelines = await getPipelines();
  return (
    pipelines.find((p) => p.productKey === productKey && p.active) ??
    pipelines.find((p) => p.productKey === "UNASSIGNED")!
  );
}

/** Products ordered for display. */
export async function getProducts() {
  let products = await prisma.product.findMany({ orderBy: { displayOrder: "asc" } });
  if (products.length === 0) {
    await ensureCatalog();
    products = await prisma.product.findMany({ orderBy: { displayOrder: "asc" } });
  }
  return products;
}
