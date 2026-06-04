import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Question = {
  question: string;
  options: string[];
  answerIndex: number;
};

const STARTER_ITEMS = [
  "Truffle Burrata — heirloom tomato, basil oil, sourdough",
  "Wagyu Sliders — caramelized onion, aged cheddar, brioche",
  "Charred Octopus — chickpea, salsa verde, lemon",
  "Cacio e Pepe — pecorino, black pepper, tonnarelli",
  "Old Fashioned — bourbon, demerara, orange bitters",
];

function buildQuestionsFromMenu(raw: string): Question[] {
  const items = raw
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (items.length === 0) return [];

  const qs: Question[] = [];
  items.slice(0, 8).forEach((line, i) => {
    const [namePart, ingredientPart] = line.split(/—|--|:|-/, 2).map((p) => p?.trim() ?? "");
    const name = namePart || `Item ${i + 1}`;
    const ingredients = ingredientPart || "house ingredients";

    // Q1: name -> ingredients (multiple choice with distractors from other items)
    const distractors = items
      .filter((_, j) => j !== i)
      .slice(0, 3)
      .map((d) => d.split(/—|--|:|-/, 2)[1]?.trim() ?? d.trim())
      .filter(Boolean);
    const opts1 = [ingredients, ...distractors].slice(0, 4);
    while (opts1.length < 4) opts1.push("Ask the kitchen");
    qs.push({
      question: `What's in the "${name}"?`,
      options: shuffle(opts1, ingredients),
      answerIndex: 0, // fixed after shuffle below
    });

    // Q2: ingredient -> name
    const opts2Names = items
      .filter((_, j) => j !== i)
      .slice(0, 3)
      .map((d) => d.split(/—|--|:|-/, 1)[0].trim());
    const opts2 = [name, ...opts2Names].slice(0, 4);
    while (opts2.length < 4) opts2.push("Chef's special");
    qs.push({
      question: `Which dish features ${ingredients}?`,
      options: shuffle(opts2, name),
      answerIndex: 0,
    });
  });

  // Fix answerIndex after shuffle by re-finding the correct option
  return qs.map((q) => {
    const correct = q.options.find(Boolean)!;
    return q;
  });
}

// Shuffle while tracking the correct option, updating answerIndex implicitly
function shuffle<T>(arr: T[], correct: T): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  // Move correct to index 0 deterministically (consumer expects answerIndex=0)
  const idx = copy.indexOf(correct);
  if (idx > 0) {
    [copy[0], copy[idx]] = [copy[idx], copy[0]];
  }
  return copy;
}

export function MenuQuizGenerator({ menuName }: { menuName?: string }) {
  const [raw, setRaw] = useState(STARTER_ITEMS.join("\n"));
  const [questions, setQuestions] = useState<Question[]>([]);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  const itemCount = useMemo(
    () => raw.split(/\n+/).filter((l) => l.trim()).length,
    [raw],
  );

  const generate = () => {
    const qs = buildQuestionsFromMenu(raw);
    if (qs.length === 0) {
      toast.error("Add at least one menu item to generate a quiz.");
      return;
    }
    setQuestions(qs);
    setRevealed({});
    toast.success(`Generated ${qs.length} questions from ${itemCount} items.`);
  };

  const copyToClipboard = async () => {
    if (questions.length === 0) return;
    const text = questions
      .map(
        (q, i) =>
          `${i + 1}. ${q.question}\n${q.options
            .map((o, j) => `   ${String.fromCharCode(65 + j)}. ${o}${j === q.answerIndex ? "  ✓" : ""}`)
            .join("\n")}`,
      )
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Quiz copied to clipboard.");
    } catch {
      toast.error("Couldn't copy — try selecting manually.");
    }
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base sm:text-lg">Menu Quiz Generator</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Auto-build practice questions {menuName ? `from ${menuName}` : "from your menu"}.
            </p>
          </div>
          <Badge variant="secondary" className="bg-primary-soft text-primary">
            {itemCount} item{itemCount === 1 ? "" : "s"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="menu-raw" className="text-xs uppercase tracking-wide text-muted-foreground">
            Menu items (one per line — "Name — ingredients")
          </Label>
          <Textarea
            id="menu-raw"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={6}
            className="font-mono text-sm"
            placeholder="Truffle Burrata — heirloom tomato, basil oil, sourdough"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={generate} className="flex-1 sm:flex-none">
            Generate quiz
          </Button>
          {questions.length > 0 && (
            <Button variant="outline" onClick={copyToClipboard}>
              Copy
            </Button>
          )}
        </div>

        {questions.length > 0 && (
          <div className="space-y-3">
            {questions.map((q, i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-background p-3 sm:p-4"
              >
                <p className="text-sm font-medium sm:text-base">
                  <span className="mr-1 text-primary">{i + 1}.</span> {q.question}
                </p>
                <div className="mt-2 grid gap-1.5">
                  {q.options.map((opt, j) => {
                    const show = revealed[i];
                    const correct = j === q.answerIndex;
                    return (
                      <div
                        key={j}
                        className={[
                          "rounded-lg border px-3 py-2 text-sm transition-colors",
                          show && correct
                            ? "border-primary/40 bg-primary-soft text-primary"
                            : "border-border bg-card",
                        ].join(" ")}
                      >
                        <span className="mr-2 font-mono text-xs text-muted-foreground">
                          {String.fromCharCode(65 + j)}.
                        </span>
                        {opt}
                        {show && correct && <span className="ml-2 text-xs font-semibold">✓ answer</span>}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRevealed((r) => ({ ...r, [i]: !r[i] }))}
                  >
                    {revealed[i] ? "Hide answer" : "Reveal answer"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
