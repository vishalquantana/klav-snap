// @vitest-environment jsdom
//
// Regression guard for the P1 "submit failed: 400" bug. On an "email"-gated project the modal shows a
// REQUIRED email field, but the submit handler never forwarded the typed email to onSubmit, so the host
// never sent reporter_email and the server rejected every submit with 400 "A valid email is required".
import { describe, it, expect, vi } from "vitest"
import { buildModal } from "@klavity/core/modal"

function latestModalShadow(): ShadowRoot {
  const hosts = Array.from(document.body.querySelectorAll("div")).filter((d) => (d as any).shadowRoot) as HTMLElement[]
  const host = hosts.reverse().find((d) => (d as any).shadowRoot.querySelector(".klavity-modal"))
  if (!host) throw new Error("modal host not found")
  return (host as any).shadowRoot as ShadowRoot
}

describe("buildModal email gate", () => {
  it("forwards the required gate email to onSubmit as reporterEmail", async () => {
    const onSubmit = vi.fn(async () => ({ issueKey: "fb1", issueUrl: "https://k/dashboard" }))
    buildModal("bug", { onCaptureFull: async () => "", onSubmit, requireEmail: true })

    const sr = latestModalShadow()
    const desc = sr.querySelector("#klavity-desc") as HTMLTextAreaElement
    const email = sr.querySelector("#klavity-remail") as HTMLInputElement
    const submit = sr.querySelector("#klavity-submit") as HTMLButtonElement
    expect(email).toBeTruthy() // the email field is shown when requireEmail is set

    desc.value = "checkout button does nothing"
    desc.dispatchEvent(new Event("input"))
    // submit stays disabled until a valid email is present
    expect(submit.disabled).toBe(true)
    email.value = "buyer@test.local"
    email.dispatchEvent(new Event("input"))
    expect(submit.disabled).toBe(false)

    submit.click()
    await Promise.resolve(); await Promise.resolve()

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const payload = onSubmit.mock.calls[0][0]
    expect(payload.reporterEmail).toBe("buyer@test.local")
    expect(payload.description).toBe("checkout button does nothing")
  })

  it("omits reporterEmail when no email gate is shown (authed/extension path)", async () => {
    const onSubmit = vi.fn(async () => ({ issueKey: "fb2", issueUrl: "https://k/dashboard" }))
    buildModal("bug", { onCaptureFull: async () => "", onSubmit }) // requireEmail falsy

    const sr = latestModalShadow()
    const desc = sr.querySelector("#klavity-desc") as HTMLTextAreaElement
    const submit = sr.querySelector("#klavity-submit") as HTMLButtonElement
    expect(sr.querySelector("#klavity-remail")).toBeNull() // no email field

    desc.value = "x"
    desc.dispatchEvent(new Event("input"))
    submit.click()
    await Promise.resolve(); await Promise.resolve()

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].reporterEmail).toBeUndefined()
  })
})
