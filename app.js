import { firebaseConfig, adminEmails } from "./firebase-config.js";

const FIREBASE_SDK_VERSION = "10.12.2";
const firebaseAppUrl = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`;
const firebaseAuthUrl = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js`;
const firebaseStoreUrl = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`;

let authClient = null;
let dbClient = null;
let currentUser = null;
let currentBalance = 0;

const modal = document.querySelector("[data-modal]");
const openButtons = document.querySelectorAll("[data-open-withdraw]");
const closeButton = document.querySelector("[data-close-modal]");
const form = document.querySelector("#withdraw-form");
const note = document.querySelector("#form-note");

const authModal = document.querySelector("[data-auth-modal]");
const authOpenButtons = document.querySelectorAll("[data-open-auth]");
const authCloseButton = document.querySelector("[data-close-auth]");
const authForm = document.querySelector("#auth-form");
const authNote = document.querySelector("#auth-note");
const authTitle = document.querySelector("#auth-title");
const authEyebrow = document.querySelector("#auth-eyebrow");
const authNameField = document.querySelector("[data-auth-name]");
const authSubmit = document.querySelector("#auth-submit");
const authToggle = document.querySelector("[data-toggle-auth]");
const authStatus = document.querySelector("[data-auth-status]");
const signoutButton = document.querySelector("[data-signout]");
const authButtons = document.querySelectorAll("[data-open-auth]");
const balanceValue = document.querySelector("[data-balance]");

const openModal = () => {
  if (!modal) return;
  modal.hidden = false;
  document.body.style.overflow = "hidden";
};

const closeModal = () => {
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = "";
};

const initFirebase = async () => {
  if (!firebaseConfig?.apiKey || firebaseConfig.apiKey === "YOUR_API_KEY") {
    return null;
  }

  const firebaseApp = await import(firebaseAppUrl);
  const firebaseAuth = await import(firebaseAuthUrl);
  const firebaseStore = await import(firebaseStoreUrl);
  const app = firebaseApp.initializeApp(firebaseConfig);
  authClient = firebaseAuth.getAuth(app);
  dbClient = firebaseStore.getFirestore(app);

  return {
    createUserWithEmailAndPassword: firebaseAuth.createUserWithEmailAndPassword,
    signInWithEmailAndPassword: firebaseAuth.signInWithEmailAndPassword,
    onAuthStateChanged: firebaseAuth.onAuthStateChanged,
    signOut: firebaseAuth.signOut,
    doc: firebaseStore.doc,
    getDoc: firebaseStore.getDoc,
    setDoc: firebaseStore.setDoc,
    updateDoc: firebaseStore.updateDoc,
    addDoc: firebaseStore.addDoc,
    collection: firebaseStore.collection,
    getDocs: firebaseStore.getDocs,
    orderBy: firebaseStore.orderBy,
    limit: firebaseStore.limit,
    query: firebaseStore.query
  };
};

const getAuthMethods = async () => {
  if (authClient) {
    return {
      createUserWithEmailAndPassword: (email, password) =>
        import(firebaseAuthUrl).then((firebaseAuth) =>
          firebaseAuth.createUserWithEmailAndPassword(authClient, email, password)
        ),
      signInWithEmailAndPassword: (email, password) =>
        import(firebaseAuthUrl).then((firebaseAuth) =>
          firebaseAuth.signInWithEmailAndPassword(authClient, email, password)
        ),
      onAuthStateChanged: (callback) =>
        import(firebaseAuthUrl).then((firebaseAuth) =>
          firebaseAuth.onAuthStateChanged(authClient, callback)
        ),
      signOut: () =>
        import(firebaseAuthUrl).then((firebaseAuth) => firebaseAuth.signOut(authClient)),
      doc: (...args) =>
        import(firebaseStoreUrl).then((firebaseStore) => firebaseStore.doc(...args)),
      getDoc: (ref) =>
        import(firebaseStoreUrl).then((firebaseStore) => firebaseStore.getDoc(ref)),
      setDoc: (ref, data) =>
        import(firebaseStoreUrl).then((firebaseStore) => firebaseStore.setDoc(ref, data)),
      updateDoc: (ref, data) =>
        import(firebaseStoreUrl).then((firebaseStore) => firebaseStore.updateDoc(ref, data)),
      addDoc: (ref, data) =>
        import(firebaseStoreUrl).then((firebaseStore) => firebaseStore.addDoc(ref, data)),
      collection: (...args) =>
        import(firebaseStoreUrl).then((firebaseStore) =>
          firebaseStore.collection(...args)
        ),
      getDocs: (ref) =>
        import(firebaseStoreUrl).then((firebaseStore) => firebaseStore.getDocs(ref)),
      orderBy: (...args) =>
        import(firebaseStoreUrl).then((firebaseStore) => firebaseStore.orderBy(...args)),
      limit: (...args) =>
        import(firebaseStoreUrl).then((firebaseStore) => firebaseStore.limit(...args)),
      query: (...args) =>
        import(firebaseStoreUrl).then((firebaseStore) => firebaseStore.query(...args))
    };
  }
  return initFirebase();
};

const formatCurrency = (value) => {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return "$0.00";
  return numeric.toLocaleString("en-US", {
    style: "currency",
    currency: "USD"
  });
};

const updateAuthUI = (user) => {
  if (authStatus) {
    authStatus.textContent = user ? `Signed in as ${user.email}` : "Signed out";
  }
  authButtons.forEach((button) => {
    button.hidden = Boolean(user);
  });
  if (signoutButton) {
    signoutButton.hidden = !user;
  }
  const dashboardLinks = document.querySelectorAll("[data-dashboard-link]");
  dashboardLinks.forEach((link) => {
    link.hidden = !user;
  });
};

const ensureUserProfile = async (methods, user) => {
  if (!methods || !user) return null;
  const docRef = await methods.doc(dbClient, "users", user.uid);
  const snapshot = await methods.getDoc(docRef);
  if (!snapshot.exists()) {
    await methods.setDoc(docRef, {
      email: user.email,
      balance: 0,
      createdAt: new Date().toISOString()
    });
    return 0;
  }
  const data = snapshot.data();
  return data?.balance ?? 0;
};

const loadUserBalance = async (methods, user) => {
  if (!balanceValue) return;
  if (!methods || !user) {
    balanceValue.textContent = "$2,129.00";
    return;
  }
  const balance = await ensureUserProfile(methods, user);
  currentBalance = Number(balance) || 0;
  balanceValue.textContent = formatCurrency(balance);
};

const loadWithdrawalHistory = async (methods, user) => {
  const container = document.querySelector("#withdrawal-rows");
  if (!container) return;
  if (!methods || !user) {
    container.innerHTML = `
      <div class="table-row">
        <span>—</span>
        <span>—</span>
        <span>—</span>
        <span>Sign in to view history</span>
      </div>
    `;
    return;
  }

  const withdrawCollection = await methods.collection(
    dbClient,
    "users",
    user.uid,
    "withdrawals"
  );
  const sort = await methods.orderBy("createdAt", "desc");
  const limiter = await methods.limit(10);
  const queryRef = await methods.query(withdrawCollection, sort, limiter);
  const snapshot = await methods.getDocs(queryRef);

  if (snapshot.empty) {
    container.innerHTML = `
      <div class="table-row">
        <span>—</span>
        <span>—</span>
        <span>—</span>
        <span>No withdrawals yet</span>
      </div>
    `;
    return;
  }

  container.innerHTML = "";
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const date = data?.createdAt
      ? new Date(data.createdAt).toLocaleDateString("en-US")
      : "—";
    const method = data?.method || "—";
    const amount = formatCurrency(data?.amount || 0);
    const status = data?.status || "Pending";

    const row = document.createElement("div");
    row.className = "table-row";
    row.innerHTML = `
      <span>${date}</span>
      <span>${method}</span>
      <span>${amount}</span>
      <span>${status}</span>
    `;
    container.appendChild(row);
  });
};

const loadEarningsActivity = async (methods, user) => {
  const container = document.querySelector("#earnings-rows");
  if (!container) return;
  if (!methods || !user) {
    container.innerHTML = `
      <div class="activity-row">
        <span>—</span>
        <span>—</span>
        <span>Sign in to view activity</span>
      </div>
    `;
    return;
  }

  const activityCollection = await methods.collection(
    dbClient,
    "users",
    user.uid,
    "activities"
  );
  const sort = await methods.orderBy("createdAt", "desc");
  const limiter = await methods.limit(10);
  const queryRef = await methods.query(activityCollection, sort, limiter);
  const snapshot = await methods.getDocs(queryRef);

  if (snapshot.empty) {
    container.innerHTML = `
      <div class="activity-row">
        <span>—</span>
        <span>—</span>
        <span>No earnings activity yet</span>
      </div>
    `;
    return;
  }

  container.innerHTML = "";
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const date = data?.createdAt
      ? new Date(data.createdAt).toLocaleDateString("en-US")
      : "—";
    const amount = formatCurrency(data?.amount || 0);
    const detail = data?.detail || "Reward credited";

    const row = document.createElement("div");
    row.className = "activity-row";
    row.innerHTML = `
      <span>${date}</span>
      <span>${amount}</span>
      <span>${detail}</span>
    `;
    container.appendChild(row);
  });
};

const addActivity = async (methods, uid, payload) => {
  if (!methods || !uid) return;
  const activityCollection = await methods.collection(dbClient, "users", uid, "activities");
  await methods.addDoc(activityCollection, {
    ...payload,
    createdAt: new Date().toISOString()
  });
};

const savePayoutSettings = async (methods, user, payload) => {
  if (!methods || !user) return;
  const userRef = await methods.doc(dbClient, "users", user.uid);
  await methods.updateDoc(userRef, {
    payoutSettings: payload,
    updatedAt: new Date().toISOString()
  });
};

const initWithdrawalRequest = (methods, user) => {
  const requestForm = document.querySelector("#withdraw-request-form");
  const requestNote = document.querySelector("#withdraw-request-note");
  if (!requestForm) return;

  requestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!methods || !user) {
      if (requestNote) {
        requestNote.textContent = "Sign in to request a withdrawal.";
        requestNote.hidden = false;
        window.setTimeout(() => {
          requestNote.hidden = true;
        }, 3000);
      }
      return;
    }

    const formData = new FormData(requestForm);
    const method = String(formData.get("method") || "").trim();
    const amount = Number(formData.get("amount") || 0);
    const destination = String(formData.get("destination") || "").trim();
    if (!method || !destination || Number.isNaN(amount) || amount <= 0) {
      return;
    }

    if (amount > currentBalance) {
      if (requestNote) {
        requestNote.textContent = "Insufficient balance for this request.";
        requestNote.hidden = false;
        window.setTimeout(() => {
          requestNote.hidden = true;
        }, 3000);
      }
      return;
    }

    try {
      const userRef = await methods.doc(dbClient, "users", user.uid);
      const updatedBalance = Math.max(currentBalance - amount, 0);
      await methods.updateDoc(userRef, {
        balance: updatedBalance,
        updatedAt: new Date().toISOString()
      });

      const withdrawCollection = await methods.collection(
        dbClient,
        "users",
        user.uid,
        "withdrawals"
      );
      await methods.addDoc(withdrawCollection, {
        amount,
        method,
        destination,
        status: "Pending",
        createdAt: new Date().toISOString()
      });

      await addActivity(methods, user.uid, {
        amount: -amount,
        detail: `Withdrawal requested via ${method}`
      });

      currentBalance = updatedBalance;
      if (balanceValue) {
        balanceValue.textContent = formatCurrency(updatedBalance);
      }
      await loadWithdrawalHistory(methods, user);
      await loadEarningsActivity(methods, user);

      if (requestNote) {
        requestNote.textContent = "Request submitted for review.";
        requestNote.hidden = false;
        window.setTimeout(() => {
          requestNote.hidden = true;
        }, 2600);
      }
      requestForm.reset();
    } catch (error) {
      if (requestNote) {
        requestNote.textContent =
          error?.message || "Failed to submit request. Please try again.";
        requestNote.hidden = false;
        window.setTimeout(() => {
          requestNote.hidden = true;
        }, 3200);
      }
    }
  });
};

const initAdminPanel = (methods, user) => {
  const adminPanel = document.querySelector("[data-admin-panel]");
  const adminForm = document.querySelector("#admin-balance-form");
  const adminNote = document.querySelector("#admin-note");
  const earningsForm = document.querySelector("#admin-earnings-form");
  const earningsNote = document.querySelector("#admin-earnings-note");
  if (!adminPanel || !adminForm) return;
  const isAdmin = Boolean(user && adminEmails?.includes(user.email));
  adminPanel.hidden = !isAdmin;

  if (!isAdmin) return;

  adminForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(adminForm);
    const uid = String(formData.get("uid") || "").trim();
    const balance = Number(formData.get("balance") || 0);
    const note = String(formData.get("note") || "").trim();
    if (!uid || Number.isNaN(balance)) return;

    try {
      const userDoc = await methods.doc(dbClient, "users", uid);
      await methods.updateDoc(userDoc, {
        balance,
        updatedAt: new Date().toISOString(),
        adminNote: note || null
      });
      if (adminNote) {
        adminNote.textContent = "Balance updated successfully.";
        adminNote.hidden = false;
        window.setTimeout(() => {
          adminNote.hidden = true;
        }, 2600);
      }
      await addActivity(methods, uid, {
        amount: balance,
        detail: "Admin balance update"
      });
      adminForm.reset();
    } catch (error) {
      if (adminNote) {
        adminNote.textContent =
          error?.message || "Failed to update balance. Check permissions.";
        adminNote.hidden = false;
        window.setTimeout(() => {
          adminNote.hidden = true;
        }, 3200);
      }
    }
  });

  if (!earningsForm) return;

  earningsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(earningsForm);
    const uid = String(formData.get("uid") || "").trim();
    const amount = Number(formData.get("amount") || 0);
    const detail = String(formData.get("detail") || "").trim() || "Manual credit";
    if (!uid || Number.isNaN(amount) || amount <= 0) return;

    try {
      const userRef = await methods.doc(dbClient, "users", uid);
      const snapshot = await methods.getDoc(userRef);
      const current = snapshot.exists() ? Number(snapshot.data()?.balance || 0) : 0;
      const nextBalance = current + amount;
      await methods.updateDoc(userRef, {
        balance: nextBalance,
        updatedAt: new Date().toISOString()
      });

      await addActivity(methods, uid, {
        amount,
        detail
      });

      if (earningsNote) {
        earningsNote.textContent = "Earnings added successfully.";
        earningsNote.hidden = false;
        window.setTimeout(() => {
          earningsNote.hidden = true;
        }, 2600);
      }
      earningsForm.reset();

      if (currentUser && currentUser.uid === uid) {
        currentBalance = nextBalance;
        if (balanceValue) {
          balanceValue.textContent = formatCurrency(nextBalance);
        }
        await loadEarningsActivity(methods, currentUser);
      }
    } catch (error) {
      if (earningsNote) {
        earningsNote.textContent =
          error?.message || "Failed to add earnings. Check permissions.";
        earningsNote.hidden = false;
        window.setTimeout(() => {
          earningsNote.hidden = true;
        }, 3200);
      }
    }
  });
};

const setAuthMode = (mode) => {
  if (!authTitle || !authEyebrow || !authNameField || !authSubmit || !authToggle) {
    return;
  }
  const isSignup = mode === "signup";
  authTitle.textContent = isSignup ? "Create account" : "Sign in";
  authEyebrow.textContent = isSignup ? "Get started" : "Account access";
  authNameField.hidden = !isSignup;
  authSubmit.textContent = isSignup ? "Create account" : "Sign in";
  authToggle.textContent = isSignup
    ? "Already have an account? Sign in"
    : "Need an account? Create one";
  authForm?.setAttribute("data-auth-mode", mode);
};

const openAuthModal = (mode) => {
  if (!authModal) return;
  setAuthMode(mode);
  authModal.hidden = false;
  document.body.style.overflow = "hidden";
};

const closeAuthModal = () => {
  if (!authModal) return;
  authModal.hidden = true;
  document.body.style.overflow = "";
};

openButtons.forEach((button) => {
  button.addEventListener("click", openModal);
});

if (closeButton) {
  closeButton.addEventListener("click", closeModal);
}

if (modal) {
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      method: String(formData.get("method") || ""),
      identifier: String(formData.get("identifier") || ""),
      threshold: String(formData.get("threshold") || ""),
      instant: Boolean(formData.get("instant"))
    };

    const methods = await getAuthMethods();
    if (!methods || !currentUser) {
      if (note) {
        note.textContent = "Sign in to save payout settings.";
        note.hidden = false;
        window.setTimeout(() => {
          note.hidden = true;
        }, 3000);
      }
      return;
    }

    try {
      await savePayoutSettings(methods, currentUser, payload);
      if (note) {
        note.textContent = "Settings saved. Update will apply to future withdrawals.";
        note.hidden = false;
        window.setTimeout(() => {
          note.hidden = true;
        }, 2400);
      }
      form.reset();
      closeModal();
    } catch (error) {
      if (note) {
        note.textContent =
          error?.message || "Could not save settings. Please try again.";
        note.hidden = false;
        window.setTimeout(() => {
          note.hidden = true;
        }, 3000);
      }
    }
  });
}

authOpenButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const mode = button.getAttribute("data-open-auth") || "signin";
    openAuthModal(mode);
  });
});

if (authCloseButton) {
  authCloseButton.addEventListener("click", closeAuthModal);
}

if (authModal) {
  authModal.addEventListener("click", (event) => {
    if (event.target === authModal) {
      closeAuthModal();
    }
  });
}

if (authToggle) {
  authToggle.addEventListener("click", () => {
    const current = authForm?.getAttribute("data-auth-mode") || "signin";
    setAuthMode(current === "signup" ? "signin" : "signup");
  });
}

if (authForm) {
  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(authForm);
    const email = String(formData.get("email") || "");
    const password = String(formData.get("password") || "");
    const mode = authForm.getAttribute("data-auth-mode") || "signin";

    const methods = await getAuthMethods();
    if (!methods) {
      if (authNote) {
        authNote.textContent =
          "Add your Firebase config to firebase-config.js to activate sign-in.";
        authNote.hidden = false;
        window.setTimeout(() => {
          authNote.hidden = true;
        }, 3200);
      }
      return;
    }

    try {
      if (mode === "signup") {
        const result = await methods.createUserWithEmailAndPassword(email, password);
        await ensureUserProfile(methods, result.user);
      } else {
        await methods.signInWithEmailAndPassword(email, password);
      }

      if (authNote) {
        authNote.textContent = "Success! You are signed in.";
        authNote.hidden = false;
        window.setTimeout(() => {
          authNote.hidden = true;
        }, 2400);
      }
      authForm.reset();
      closeAuthModal();
    } catch (error) {
      if (authNote) {
        authNote.textContent =
          error?.message || "Sign-in failed. Please check your details.";
        authNote.hidden = false;
        window.setTimeout(() => {
          authNote.hidden = true;
        }, 3200);
      }
    }
  });
}

const bootAuth = async () => {
  const methods = await getAuthMethods();
  if (!methods) {
    updateAuthUI(null);
    return;
  }

  methods.onAuthStateChanged(async (user) => {
    currentUser = user;
    updateAuthUI(user);
    await loadUserBalance(methods, user);
    await loadWithdrawalHistory(methods, user);
    await loadEarningsActivity(methods, user);
    initAdminPanel(methods, user);
    initWithdrawalRequest(methods, user);
  });

  if (signoutButton) {
    signoutButton.addEventListener("click", async () => {
      try {
        await methods.signOut();
      } catch (error) {
        if (authNote) {
          authNote.textContent =
            error?.message || "Could not sign out. Please try again.";
          authNote.hidden = false;
          window.setTimeout(() => {
            authNote.hidden = true;
          }, 3000);
        }
      }
    });
  }
};

bootAuth();
