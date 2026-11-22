import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/client/components/EmptyState";
import { Field } from "@/client/components/Field";
import { PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { messageOf } from "@/client/lib/errors";
import { slugify } from "@/lib/money";
import {
  deleteCollection,
  getCollections,
  saveCollection,
} from "@/serverFunctions/catalog";
import { StaffError } from "../_staff";

export const Route = createFileRoute("/_staff/collections")({
  loader: () => getCollections(),
  head: () => ({ meta: [{ title: "Collections" }] }),
  errorComponent: StaffError,
  component: Collections,
});

function Collections() {
  const collections = Route.useLoaderData();
  const router = useRouter();
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    setError(null);
    setBusy(true);
    try {
      await saveCollection({ data: { name, handle: handle || slugify(name) } });
      setName("");
      setHandle("");
      await router.invalidate();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, label: string) {
    if (!window.confirm(`Delete the collection ${label}? Its products stay.`)) return;
    try {
      await deleteCollection({ data: { id } });
      toast.success("Collection deleted");
      await router.invalidate();
    } catch (cause) {
      toast.error(messageOf(cause));
    }
  }

  return (
    <>
      <PageHeader title="Collections" />
      <Card>
        <CardContent>
          <form
            className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <Field label="Name">
              <Input value={name} required onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Handle">
              <Input
                value={handle}
                placeholder={slugify(name) || "handle"}
                onChange={(e) => setHandle(e.target.value)}
              />
            </Field>
            <Button type="submit" pending={busy}>
              Add collection
            </Button>
          </form>
          {error ? (
            <Alert variant="destructive" className="mt-3">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
      {collections.length === 0 ? (
        <EmptyState
          title="No collections yet"
          description="Add one above and buyers can browse by it."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Handle</TableHead>
              <TableHead className="text-right">Products</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {collections.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-muted-foreground">{c.handle}</TableCell>
                <TableCell className="text-right tabular-nums">{c.productCount}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${c.name}`}
                    onClick={() => void remove(c.id, c.name)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
