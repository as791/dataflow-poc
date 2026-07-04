Modal — centered dialog with heavy-blur backdrop, matching `.glass-modal-backdrop` / `.glass-modal`. Used for connect-account flows (Zendesk subdomain), add-credential forms, confirmations.

```jsx
<Modal title="Connect Zendesk subdomain" onClose={close}
  footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary">Connect →</Button></>}>
  <Input placeholder="acme" />
</Modal>
```
