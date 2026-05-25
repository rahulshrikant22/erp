import { prisma } from '../lib/prisma';

// -- Pricing Resolution -------------------------------------------------------

export interface PriceResolution {
  unitPrice: number;
  priceSource: 'manual_override' | 'customer_tier' | 'customer_type_tier' | 'size_variant' | 'base_price';
  appliedDiscount: number | null;
}

export async function resolvePrice(
  productId: string,
  sizeVariantId: string | null | undefined,
  customerId: string,
  _quantity: number,
  manualPrice?: number,
): Promise<PriceResolution> {
  // 1. Manual override — caller passed an explicit price
  if (manualPrice !== undefined && manualPrice !== null) {
    return { unitPrice: manualPrice, priceSource: 'manual_override', appliedDiscount: null };
  }

  const product = await prisma.product.findUnique({ where: { id: productId }, select: { basePrice: true } });
  if (!product) return { unitPrice: 0, priceSource: 'base_price', appliedDiscount: null };

  const basePrice = Number(product.basePrice);
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { customerType: true } });

  // 2. Customer-specific tier pricing (customer_tier_pricing for this customer + product)
  const now = new Date();
  const customerTier = await prisma.customerTierPricing.findFirst({
    where: {
      customerId,
      productId,
      OR: [
        { validFrom: null, validUntil: null },
        { validFrom: { lte: now }, validUntil: null },
        { validFrom: null, validUntil: { gte: now } },
        { validFrom: { lte: now }, validUntil: { gte: now } },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  if (customerTier) {
    if (customerTier.specialPrice !== null) {
      const discount = basePrice - Number(customerTier.specialPrice);
      return { unitPrice: Number(customerTier.specialPrice), priceSource: 'customer_tier', appliedDiscount: discount };
    }
    if (customerTier.discountPercent !== null) {
      const discount = basePrice * Number(customerTier.discountPercent) / 100;
      return { unitPrice: basePrice - discount, priceSource: 'customer_tier', appliedDiscount: discount };
    }
  }

  // 3. Customer-type tier pricing (product_tier_pricing for customer's type)
  if (customer?.customerType) {
    const typeTier = await prisma.productTierPricing.findFirst({
      where: {
        productId,
        customerType: customer.customerType,
        OR: [
          { validFrom: null, validUntil: null },
          { validFrom: { lte: now }, validUntil: null },
          { validFrom: null, validUntil: { gte: now } },
          { validFrom: { lte: now }, validUntil: { gte: now } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    if (typeTier) {
      if (typeTier.fixedPrice !== null) {
        const discount = basePrice - Number(typeTier.fixedPrice);
        return { unitPrice: Number(typeTier.fixedPrice), priceSource: 'customer_type_tier', appliedDiscount: discount };
      }
      if (typeTier.discountPercent !== null) {
        const discount = basePrice * Number(typeTier.discountPercent) / 100;
        return { unitPrice: basePrice - discount, priceSource: 'customer_type_tier', appliedDiscount: discount };
      }
    }
  }

  // 4. Size variant price_override
  if (sizeVariantId) {
    const variant = await prisma.productSizeVariant.findUnique({ where: { id: sizeVariantId }, select: { priceOverride: true } });
    if (variant?.priceOverride !== null && variant?.priceOverride !== undefined) {
      return { unitPrice: Number(variant.priceOverride), priceSource: 'size_variant', appliedDiscount: null };
    }
  }

  // 5. Product base_price
  return { unitPrice: basePrice, priceSource: 'base_price', appliedDiscount: null };
}

// -- Discount Application -----------------------------------------------------

export interface DiscountResult {
  unitPriceFinal: number;
  discountAmount: number;
}

export function applyDiscount(unitPrice: number, discountType: string, discountValue: number): DiscountResult {
  if (discountType === 'percent') {
    const discountAmount = unitPrice * discountValue / 100;
    return { unitPriceFinal: unitPrice - discountAmount, discountAmount };
  }
  if (discountType === 'amount') {
    return { unitPriceFinal: unitPrice - discountValue, discountAmount: discountValue };
  }
  return { unitPriceFinal: unitPrice, discountAmount: 0 };
}

// -- GST Tax Calculation ------------------------------------------------------

export interface TaxResult {
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  totalTax: number;
}

export function calculateTax(taxableValue: number, taxRatePercent: number, isInterstate: boolean): TaxResult {
  const totalTax = taxableValue * taxRatePercent / 100;

  if (isInterstate) {
    return {
      cgstRate: 0,
      cgstAmount: 0,
      sgstRate: 0,
      sgstAmount: 0,
      igstRate: taxRatePercent,
      igstAmount: totalTax,
      totalTax,
    };
  }

  const halfRate = taxRatePercent / 2;
  const halfTax = totalTax / 2;
  return {
    cgstRate: halfRate,
    cgstAmount: halfTax,
    sgstRate: halfRate,
    sgstAmount: halfTax,
    igstRate: 0,
    igstAmount: 0,
    totalTax,
  };
}

// -- Place of Supply ----------------------------------------------------------

export async function getOrgStateCode(): Promise<string> {
  const org = await prisma.organization.findFirst({ select: { gstin: true } });
  if (org?.gstin && org.gstin.length >= 2) return org.gstin.substring(0, 2);
  return '27'; // default Maharashtra
}

export function determineInterstate(orgStateCode: string, placeOfSupplyStateCode: string | null): boolean {
  if (!placeOfSupplyStateCode) return false;
  return orgStateCode !== placeOfSupplyStateCode;
}

// -- Amount in Words (Indian format) ------------------------------------------

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ones[n];
  return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
}

function threeDigits(n: number): string {
  if (n === 0) return '';
  if (n < 100) return twoDigits(n);
  return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + twoDigits(n % 100) : '');
}

export function amountToWords(amount: number): string {
  if (amount === 0) return 'Rupees Zero Only';

  const rounded = Math.round(amount * 100) / 100;
  const rupees = Math.floor(rounded);
  const paise = Math.round((rounded - rupees) * 100);

  if (rupees === 0 && paise > 0) {
    return `Paise ${twoDigits(paise)} Only`;
  }

  let result = '';
  let remaining = rupees;

  // Crore (10,000,000)
  const crore = Math.floor(remaining / 10000000);
  if (crore > 0) {
    result += threeDigits(crore) + ' Crore ';
    remaining %= 10000000;
  }

  // Lakh (100,000)
  const lakh = Math.floor(remaining / 100000);
  if (lakh > 0) {
    result += twoDigits(lakh) + ' Lakh ';
    remaining %= 100000;
  }

  // Thousand (1,000)
  const thousand = Math.floor(remaining / 1000);
  if (thousand > 0) {
    result += twoDigits(thousand) + ' Thousand ';
    remaining %= 1000;
  }

  // Hundreds + remainder
  if (remaining > 0) {
    result += threeDigits(remaining);
  }

  result = 'Rupees ' + result.trim();

  if (paise > 0) {
    result += ' and Paise ' + twoDigits(paise);
  }

  return result + ' Only';
}

// -- Rounding (Indian invoice norms) ------------------------------------------

export interface RoundingResult {
  roundedTotal: number;
  roundOffAmount: number;
}

export function roundToNearestRupee(grandTotal: number): RoundingResult {
  const roundedTotal = Math.round(grandTotal);
  const roundOffAmount = roundedTotal - grandTotal;
  return {
    roundedTotal,
    roundOffAmount: Math.round(roundOffAmount * 100) / 100,
  };
}
