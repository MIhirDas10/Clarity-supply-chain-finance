function calculateInvoiceRisk(buyerData, invoiceAmount) {
  // Expected fields in buyerData:
  // - onTimePaymentsRatio (0 to 1)
  // - isVerified (boolean) - BGMEA/BTMA verified
  // - accountAgeMonths (integer)
  // - averageInvoiceAmount (number)

  const timelinessRatio = buyerData.onTimePaymentsRatio || 0;
  const isVerified = buyerData.isVerified || false;
  const accountAge = buyerData.accountAgeMonths || 0;
  const avgAmount = buyerData.averageInvoiceAmount || invoiceAmount;

  // Timeliness (35% weight): Ratio of on-time payments. (0 to 100)
  const timelinessScore = Math.min(Math.max(timelinessRatio * 100, 0), 100);
  
  // Membership (25% weight): BGMEA/BTMA verified status (100 if verified, 40 if not).
  const membershipScore = isVerified ? 100 : 40;

  // Volume Ratio (25% weight): Score inversely proportional to invoiceAmount / averageInvoiceAmount.
  // For example, if invoice amount is much larger than average, score decreases.
  const volumeRatio = invoiceAmount / (avgAmount > 0 ? avgAmount : invoiceAmount || 1);
  let volumeScore = 100;
  if (volumeRatio > 1) {
    volumeScore = Math.max(100 - ((volumeRatio - 1) * 20), 0);
  }

  // Account Age (15% weight): Platform account age in months. Max 100 for 24+ months.
  const ageScore = Math.min((accountAge / 24) * 100, 100);

  const totalScore = Math.round(
    (timelinessScore * 0.35) +
    (membershipScore * 0.25) +
    (volumeScore * 0.25) +
    (ageScore * 0.15)
  );

  let rating = 'Rating C';
  let expectedYield = 18.0; // falls in 17.0% - 19.0%

  if (totalScore >= 80) {
    rating = 'Rating A';
    expectedYield = 13.0; // falls in 12.0% - 14.0%
  } else if (totalScore >= 60) {
    rating = 'Rating B';
    expectedYield = 15.5; // falls in 14.5% - 16.5%
  }

  return {
    score: totalScore,
    rating,
    expectedYield,
    details: {
      timelinessScore: Math.round(timelinessScore),
      membershipScore: Math.round(membershipScore),
      volumeScore: Math.round(volumeScore),
      ageScore: Math.round(ageScore)
    }
  };
}

module.exports = {
  calculateInvoiceRisk
};
