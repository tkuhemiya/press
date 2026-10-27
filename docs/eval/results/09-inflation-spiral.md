# How a wage-price spiral works

A wage-price spiral is inflation that feeds on itself. Prices rise, workers ask for higher pay to keep up, firms pass the higher labour costs on as higher prices, and the cycle turns again. No single step is irrational. The danger is that the loop can keep running long after whatever started it has gone away.

## The loop

```causal-loop id=spiral title="Wage-price spiral and the policy brake"
prices -> living_costs : +
living_costs -> wage_demands : +
wage_demands -> wages : +
wages -> labour_costs : +
labour_costs -> prices : +
prices -> expectations : +
expectations -> wage_demands : +
expectations -> prices : +
prices -> policy_rate : +
policy_rate -> demand : -
demand -> prices : +
demand -> wages : +
loop "Wage-price spiral": prices -> living_costs -> wage_demands -> wages -> labour_costs -> prices
loop "Expectations": prices -> expectations -> prices
loop "Policy brake": prices -> policy_rate -> demand -> prices

steps:
  prices -> living_costs "Something pushes prices up first, often an energy or supply shock. Real wages fall."
  wage_demands -> wages "Workers bargain to recover lost purchasing power, and in a tight labour market they win."
  labour_costs -> prices "Firms pass higher wage bills on to customers, and the loop closes."
  prices -> expectations "Once people expect inflation, they build it into contracts and price lists in advance, which speeds the loop up."
  prices -> policy_rate "The central bank raises interest rates, cooling demand until firms can no longer pass costs on."
```

### The reinforcing core

Follow the [main loop](#spiral.prices) around. Higher [prices](#spiral.prices) raise the cost of living, which raises [wage demands](#spiral.wage_demands). If workers have bargaining power, actual [wages](#spiral.wages) rise. For most firms wages are the largest cost, so higher [labour costs](#spiral.labour_costs) push prices up again. Every link has the same sign, so the loop is reinforcing: whatever direction it is pushed, it keeps going.

Whether it actually spirals depends on the strength of each link. If wage settlements only partly catch up with past inflation, or firms absorb some cost increases in their margins, each lap is smaller than the last and the shock fades out. If wages fully catch up and firms fully pass costs through, each lap is as big as the last.

### Expectations are the accelerator

The second loop is what turns a slow ratchet into a spiral. When people start to *expect* inflation, they stop waiting for it. Unions ask for raises based on next year's inflation, not last year's. Firms raise prices pre-emptively and write escalation clauses into contracts. Through [expectations](#spiral.expectations), prices feed into wages and prices directly, without waiting for the slower chain of bargaining rounds. The 1970s in the US and UK are the textbook case: inflation expectations became unanchored, and each year's settlements built in more inflation than the last.

## What central banks do

A central bank cannot set wages or prices, but it controls the short-term [interest rate](#spiral.policy_rate), and that gives it the balancing loop.

Higher rates make borrowing more expensive and saving more attractive. Households postpone big purchases, firms postpone investment, and asset prices soften. Weaker [demand](#spiral.demand) does two things at once: firms find they cannot raise prices without losing customers, and a cooler labour market weakens workers' bargaining power. Both links of the spiral loosen.

The catch is timing and cost. Rate rises take a year or more to work through the economy, so a bank that waits until the spiral is visible has to tighten harder. The cure is often a recession: Paul Volcker's Federal Reserve pushed rates near 20% in 1980–81 to break US inflation, and unemployment passed 10%.

That is why central banks put so much weight on **credibility**. If people believe the bank will do whatever it takes to bring inflation back to target, typically 2%, then expectations stay anchored, the accelerator loop never engages, and a temporary price shock stays temporary. Independent central banks, explicit inflation targets, forward guidance and acting early rather than late are all ways to keep the expectations loop switched off, so that the much more painful brake is needed less often.
