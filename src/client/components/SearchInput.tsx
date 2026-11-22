import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Input } from "@/client/components/ui/input";

/** A search box that reports its text after typing pauses. */
export function SearchInput({
  value,
  placeholder,
  onSearch,
}: {
  value: string;
  placeholder: string;
  onSearch: (text: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => {
    if (text === value) return;
    const timer = setTimeout(() => onSearch(text), 250);
    return () => clearTimeout(timer);
  }, [text, value, onSearch]);
  return (
    <div className="relative min-w-48 flex-1">
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        className="pl-8"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
    </div>
  );
}
