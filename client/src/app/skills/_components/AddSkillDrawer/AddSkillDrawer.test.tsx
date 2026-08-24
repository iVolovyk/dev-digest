import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillImportCandidate } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const h = vi.hoisted(() => ({
  createMutate: vi.fn(),
  previewMutateAsync: vi.fn(),
}));

vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutate: h.createMutate, isPending: false }),
  useImportPreview: () => ({ mutateAsync: h.previewMutateAsync, isPending: false }),
  fileToImportInput: async (file: File) => ({ filename: file.name, content: "…" }),
}));

import { AddSkillDrawer } from "./AddSkillDrawer";

const CANDIDATE: SkillImportCandidate = {
  name: "pr-quality-rubric",
  description: "Flag PRs that change behaviour without a test.",
  type: "rubric",
  body: "# Rule\nRequire a test.",
  tokens: 12,
  skipped: [{ path: "tools/install.sh", reason: "executable — never read" }],
  warnings: ["Body contains an HTML comment"],
};

beforeEach(() => {
  h.createMutate.mockReset();
  h.previewMutateAsync.mockReset().mockResolvedValue(CANDIDATE);
});
afterEach(cleanup);

function renderDrawer(tab: "create" | "import" = "import") {
  const onCreated = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <AddSkillDrawer initialTab={tab} onClose={vi.fn()} onCreated={onCreated} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return { onCreated };
}

function upload(name = "rubric.md", bytes = 200) {
  const file = new File(["x".repeat(bytes)], name, { type: "text/markdown" });
  fireEvent.change(screen.getByLabelText("Choose a file"), { target: { files: [file] } });
  return file;
}

describe("AddSkillDrawer — import", () => {
  it("previews the parsed skill without saving anything", async () => {
    renderDrawer();
    upload();
    expect(await screen.findByText("Preview — nothing is saved yet")).toBeInTheDocument();
    expect(screen.getByDisplayValue("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText(/Require a test\./)).toBeInTheDocument();
    // The whole point of the two-step flow: nothing reaches the DB yet.
    expect(h.createMutate).not.toHaveBeenCalled();
  });

  it("lists the archive entries it refused to read", async () => {
    renderDrawer();
    upload("skills.zip");
    expect(await screen.findByText("tools/install.sh")).toBeInTheDocument();
    expect(screen.getByText("Not processed (1)")).toBeInTheDocument();
    expect(screen.getByText("executable — never read")).toBeInTheDocument();
    expect(screen.getByText("Body contains an HTML comment")).toBeInTheDocument();
  });

  it("saves only on confirm, as an untrusted and disabled skill", async () => {
    renderDrawer();
    upload();
    const save = await screen.findByRole("button", { name: "Save skill" });
    expect(h.createMutate).not.toHaveBeenCalled();

    fireEvent.click(save);
    expect(h.createMutate).toHaveBeenCalledTimes(1);
    expect(h.createMutate.mock.calls[0]?.[0]).toEqual({
      name: "pr-quality-rubric",
      description: "Flag PRs that change behaviour without a test.",
      type: "rubric",
      body: "# Rule\nRequire a test.",
      source: "imported_file",
      enabled: false,
    });
  });

  it("refuses a file over 2 MB before it is read", async () => {
    renderDrawer();
    upload("huge.md", 2 * 1024 * 1024 + 1);
    expect(await screen.findByRole("alert")).toHaveTextContent("larger than 2 MB");
    expect(h.previewMutateAsync).not.toHaveBeenCalled();
  });

  it("refuses an unsupported extension before it is read", async () => {
    renderDrawer();
    upload("payload.exe");
    expect(await screen.findByRole("alert")).toHaveTextContent("Unsupported file type");
    expect(h.previewMutateAsync).not.toHaveBeenCalled();
  });
});

describe("AddSkillDrawer — create", () => {
  it("creates a hand-written skill without a source override", async () => {
    renderDrawer("create");
    fireEvent.change(screen.getByPlaceholderText("pr-quality-rubric"), {
      target: { value: "house-style" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Describe the rule/), {
      target: { value: "# House style" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    await waitFor(() => expect(h.createMutate).toHaveBeenCalledTimes(1));
    expect(h.createMutate.mock.calls[0]?.[0]).toEqual({
      name: "house-style",
      description: "",
      type: "rubric",
      body: "# House style",
    });
  });
});
