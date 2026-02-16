export async function handler(event, context) {
    // Parse input
    const { velocity, commission, compoundFactor } = JSON.parse(event.body);

    // Ensure numeric
    const v = parseFloat(velocity);
    const c = parseFloat(commission);
    const factor = parseFloat(compoundFactor);

    if (isNaN(v) || isNaN(c) || isNaN(factor)) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid input' }) };
    }

    // Daily, monthly, annual calculations
    const daily = v * c;
    const monthlyBase = daily * 22;
    const annualBase = monthlyBase * 12;

    // Generate 12-month compound trajectory
    let monthlyProjection = [];
    let currentVal = monthlyBase;
    for (let i = 0; i < 12; i++) {
        monthlyProjection.push(Math.round(currentVal));
        currentVal *= 1 + ((factor - 1) / 12);
    }

    // Return results
    return {
        statusCode: 200,
        body: JSON.stringify({
            daily,
            monthlyBase,
            annualBase,
            monthlyProjection
        })
    };
}
