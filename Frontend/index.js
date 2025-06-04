// Estado global de la aplicación
let currentUser = null;
let products = [];
let cart = [];
let orders = [];
let categories = [];

// Configuración de la API
const API_BASE_URL = "http://localhost:8000/api"; // Cambiado para FastAPI

// Inicialización
document.addEventListener("DOMContentLoaded", function () {
  initializeApp();
  setupEventListeners();
});

function initializeApp() {
  // Verificar si hay usuario y token guardados
  const savedUser = JSON.parse(localStorage.getItem("currentUser") || "null");
  const token = localStorage.getItem("token");
  
  if (savedUser && token) {
    currentUser = savedUser;
    updateUIForLoggedUser();
  }

  loadProducts();
  loadCategories();
}

function setupEventListeners() {
  // Formulario de login
  document.getElementById("login-form").addEventListener("submit", handleLogin);

  // Formulario de registro
  document
    .getElementById("register-form")
    .addEventListener("submit", handleRegister);

  // Formulario de checkout
  document
    .getElementById("checkout-form")
    .addEventListener("submit", handleCheckout);

  // Búsqueda de productos
  document
    .getElementById("search-input")
    .addEventListener("keyup", function (e) {
      if (e.key === "Enter") {
        searchProducts();
      }
    });

  // Filtro por categoría
  document
    .getElementById("category-filter")
    .addEventListener("change", filterByCategory);
}

// Gestión de secciones
function showSection(section) {
  // Ocultar todas las secciones
  document.querySelectorAll('[id$="-section"]').forEach((el) => {
    el.classList.add("section-hidden");
  });

  // Mostrar sección solicitada
  document
    .getElementById(section + "-section")
    .classList.remove("section-hidden");

  // Cargar datos específicos de la sección
  if (section === "pedidos" && currentUser) {
    loadOrders();
  }
}

// Funciones de utilidad para API
function getAuthHeaders() {
  const token = localStorage.getItem("token");
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : ''
  };
}

async function apiRequest(url, options = {}) {
  try {
    const response = await fetch(`${API_BASE_URL}${url}`, {
      ...options,
      headers: {
        ...getAuthHeaders(),
        ...options.headers
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API Request Error:', error);
    throw error;
  }
}

// Autenticación
async function handleLogin(e) {
  e.preventDefault();

  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;

  try {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    currentUser = data.user;
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    localStorage.setItem('token', data.access_token);
    
    updateUIForLoggedUser();
    bootstrap.Modal.getInstance(document.getElementById("loginModal")).hide();
    showAlert('Inicio de sesión exitoso', 'success');
    
    // Limpiar formulario
    document.getElementById("login-form").reset();
    
  } catch (error) {
    console.error("Error en login:", error);
    showAlert(error.message || "Error al iniciar sesión", "danger");
  }
}

async function handleRegister(e) {
  e.preventDefault();

  const formData = {
    nombre: document.getElementById("register-name").value,
    email: document.getElementById("register-email").value,
    telefono: document.getElementById("register-phone").value,
    password: document.getElementById("register-password").value,
  };

  try {
    await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(formData)
    });

    showAlert("Cuenta creada exitosamente. Por favor inicia sesión.", "success");
    bootstrap.Modal.getInstance(document.getElementById("registerModal")).hide();
    
    // Limpiar formulario
    document.getElementById("register-form").reset();
    
    // Mostrar modal de login
    setTimeout(() => {
      showLoginModal();
    }, 500);
    
  } catch (error) {
    console.error("Error en registro:", error);
    showAlert(error.message || "Error al crear la cuenta", "danger");
  }
}

function logout() {
  currentUser = null;
  cart = [];
  localStorage.removeItem("currentUser");
  localStorage.removeItem("token");
  updateUIForGuestUser();
  showSection("home");
  showAlert("Sesión cerrada exitosamente", "info");
}

function updateUIForLoggedUser() {
  document.getElementById("guest-nav").style.display = "none";
  document.getElementById("user-nav").style.display = "flex";
  document.getElementById("user-name").textContent = currentUser.nombre;
}

function updateUIForGuestUser() {
  document.getElementById("guest-nav").style.display = "flex";
  document.getElementById("user-nav").style.display = "none";
}

// Gestión de productos
async function loadProducts() {
  showLoading("products-loading");

  try {
    products = await apiRequest('/productos');
    renderProducts(products);
    hideLoading("products-loading");
  } catch (error) {
    console.error("Error cargando productos:", error);
    hideLoading("products-loading");
    showAlert("Error al cargar productos", "danger");
  }
}

async function loadCategories() {
  try {
    categories = await apiRequest('/categorias');

    const categorySelect = document.getElementById("category-filter");
    // Limpiar opciones existentes (excepto "Todas")
    categorySelect.innerHTML = '<option value="">Todas las categorías</option>';
    
    categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      categorySelect.appendChild(option);
    });
  } catch (error) {
    console.error("Error cargando categorías:", error);
  }
}

function renderProducts(productsToRender) {
  const container = document.getElementById("products-container");

  if (productsToRender.length === 0) {
    container.innerHTML = `
      <div class="col-12 text-center py-5">
        <i class="fas fa-search fa-3x text-muted mb-3"></i>
        <p class="text-muted">No se encontraron productos</p>
      </div>
    `;
    return;
  }

  container.innerHTML = productsToRender
    .map(
      (product) => `
        <div class="col-lg-4 col-md-6 mb-4">
          <div class="card product-card">
            <img src="${product.imagen_url}" class="product-img" alt="${product.nombre}">
            <div class="card-body">
              <h5 class="card-title">${product.nombre}</h5>
              <p class="card-text text-muted">${product.descripcion}</p>
              <div class="d-flex justify-content-between align-items-center">
                <span class="price">$${formatPrice(product.precio)}</span>
                <span class="badge bg-secondary">${product.categoria}</span>
              </div>
              <button class="btn btn-primary w-100 mt-3" onclick="addToCart(${product.id})">
                <i class="fas fa-cart-plus me-1"></i>Agregar al Carrito
              </button>
            </div>
          </div>
        </div>
      `
    )
    .join("");
}

async function searchProducts() {
  const searchTerm = document.getElementById("search-input").value.trim();
  
  if (!searchTerm) {
    renderProducts(products);
    return;
  }

  try {
    const searchResults = await apiRequest(`/productos/buscar/${encodeURIComponent(searchTerm)}`);
    renderProducts(searchResults);
  } catch (error) {
    console.error("Error en búsqueda:", error);
    showAlert("Error al buscar productos", "danger");
  }
}

async function filterByCategory() {
  const selectedCategory = document.getElementById("category-filter").value;
  
  if (!selectedCategory) {
    renderProducts(products);
    return;
  }

  try {
    const filteredProducts = await apiRequest(`/productos/categoria/${encodeURIComponent(selectedCategory)}`);
    renderProducts(filteredProducts);
  } catch (error) {
    console.error("Error filtrando por categoría:", error);
    showAlert("Error al filtrar productos", "danger");
  }
}

// Gestión del carrito
function addToCart(productId) {
  if (!currentUser) {
    showAlert("Debes iniciar sesión para agregar productos al carrito", "warning");
    showLoginModal();
    return;
  }

  const product = products.find((p) => p.id === productId);
  if (!product) return;

  const existingItem = cart.find((item) => item.producto_id === productId);

  if (existingItem) {
    existingItem.cantidad += 1;
  } else {
    cart.push({
      producto_id: productId,
      nombre: product.nombre,
      precio: product.precio,
      imagen_url: product.imagen_url,
      cantidad: 1,
    });
  }

  updateCartUI();
  showAlert(`${product.nombre} agregado al carrito`, "success");
}

function removeFromCart(productId) {
  cart = cart.filter((item) => item.producto_id !== productId);
  updateCartUI();
}

function updateCartQuantity(productId, newQuantity) {
  const item = cart.find((item) => item.producto_id === productId);
  if (item) {
    if (newQuantity <= 0) {
      removeFromCart(productId);
    } else {
      item.cantidad = newQuantity;
      updateCartUI();
    }
  }
}

function updateCartUI() {
  const cartItemsContainer = document.getElementById("cart-items");
  const cartFooter = document.getElementById("cart-footer");
  const cartBadge = document.getElementById("cart-badge");
  const cartTotal = document.getElementById("cart-total");

  // Actualizar badge del carrito
  const totalItems = cart.reduce((sum, item) => sum + item.cantidad, 0);
  cartBadge.textContent = totalItems;

  if (cart.length === 0) {
    cartItemsContainer.innerHTML = `
      <div class="text-center p-4 text-muted">
        <i class="fas fa-shopping-cart fa-3x mb-3"></i>
        <p>Tu carrito está vacío</p>
      </div>
    `;
    cartFooter.style.display = "none";
    return;
  }

  // Calcular total
  const total = cart.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
  cartTotal.textContent = `$${formatPrice(total)}`;

  // Renderizar items del carrito
  cartItemsContainer.innerHTML = cart
    .map(
      (item) => `
        <div class="cart-item">
          <div class="d-flex align-items-center">
            <img src="${item.imagen_url}" alt="${item.nombre}">
            <div class="flex-grow-1 ms-3">
              <h6 class="mb-1">${item.nombre}</h6>
              <div class="d-flex align-items-center justify-content-between">
                <small class="text-muted">$${formatPrice(item.precio)}</small>
                <div class="d-flex align-items-center">
                  <button class="btn btn-sm btn-outline-secondary" onclick="updateCartQuantity(${item.producto_id}, ${item.cantidad - 1})">-</button>
                  <span class="mx-2">${item.cantidad}</span>
                  <button class="btn btn-sm btn-outline-secondary" onclick="updateCartQuantity(${item.producto_id}, ${item.cantidad + 1})">+</button>
                  <button class="btn btn-sm btn-outline-danger ms-2" onclick="removeFromCart(${item.producto_id})">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `
    )
    .join("");

  cartFooter.style.display = "block";
}

function toggleCart() {
  const cartSidebar = document.getElementById("cart-sidebar");
  const cartOverlay = document.getElementById("cart-overlay");

  cartSidebar.classList.toggle("active");
  cartOverlay.classList.toggle("active");
}

function proceedToCheckout() {
  if (cart.length === 0) {
    showAlert("Tu carrito está vacío", "warning");
    return;
  }

  const total = cart.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
  document.getElementById("checkout-total").textContent = `$${formatPrice(total)}`;

  toggleCart();
  bootstrap.Modal.getOrCreateInstance(document.getElementById("checkoutModal")).show();
}

async function handleCheckout(e) {
  e.preventDefault();

  const orderData = {
    total: cart.reduce((sum, item) => sum + item.precio * item.cantidad, 0),
    metodo_pago: document.getElementById("payment-method").value,
    direccion_envio: document.getElementById("checkout-address").value,
    notas: document.getElementById("checkout-notes").value,
    productos: cart.map((item) => ({
      producto_id: item.producto_id,
      cantidad: item.cantidad,
      precio_unitario: item.precio,
    })),
  };

  try {
    const result = await apiRequest('/pedidos', {
      method: 'POST',
      body: JSON.stringify(orderData)
    });

    cart = [];
    updateCartUI();

    bootstrap.Modal.getInstance(document.getElementById("checkoutModal")).hide();
    showAlert("¡Pedido realizado exitosamente!", "success");

    // Limpiar formulario
    document.getElementById("checkout-form").reset();
    
    // Recargar pedidos si estamos en la sección de pedidos
    if (document.getElementById("pedidos-section").classList.contains("section-hidden") === false) {
      loadOrders();
    }
    
  } catch (error) {
    console.error("Error procesando pedido:", error);
    showAlert(error.message || "Error al procesar el pedido", "danger");
  }
}

// Gestión de pedidos
async function loadOrders() {
  if (!currentUser) return;

  showLoading("orders-loading");

  try {
    orders = await apiRequest(`/pedidos/usuario/${currentUser.id}`);
    renderOrders(orders);
    hideLoading("orders-loading");
  } catch (error) {
    console.error("Error cargando pedidos:", error);
    hideLoading("orders-loading");
    showAlert(error.message || "Error al cargar pedidos", "danger");
  }
}

function renderOrders(ordersToRender) {
  const container = document.getElementById("orders-container");

  if (ordersToRender.length === 0) {
    container.innerHTML = `
      <div class="text-center py-5">
        <i class="fas fa-box fa-3x text-muted mb-3"></i>
        <p class="text-muted">No tienes pedidos realizados</p>
        <button class="btn btn-primary" onclick="showSection('productos')">
          <i class="fas fa-shopping-bag me-1"></i>Ver Productos
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = ordersToRender
    .map(
      (order) => `
        <div class="order-card">
          <div class="order-header">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <h6 class="mb-1">Pedido #${order.id}</h6>
                <small class="text-muted">
                  <i class="fas fa-calendar me-1"></i>
                  ${formatDate(order.fecha_pedido)}
                </small>
              </div>
              <div class="text-end">
                <div class="fw-bold">$${formatPrice(order.total)}</div>
                <small class="text-muted">${order.metodo_pago}</small>
              </div>
            </div>
          </div>
          <div class="order-body">
            ${order.productos
              .map(
                (item) => `
                <div class="order-item">
                  <div class="d-flex align-items-center">
                    <img src="${item.imagen_url}" alt="${item.nombre}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 5px;">
                    <div class="flex-grow-1 ms-3">
                      <div class="fw-medium">${item.nombre}</div>
                      <small class="text-muted">
                        Cantidad: ${item.cantidad} × $${formatPrice(item.precio_unitario)}
                      </small>
                    </div>
                    <div class="text-end">
                      <div class="fw-bold">$${formatPrice(item.cantidad * item.precio_unitario)}</div>
                    </div>
                  </div>
                </div>
              `
              )
              .join("")}
            ${
              order.direccion_envio
                ? `
                <div class="order-item">
                  <small class="text-muted">
                    <i class="fas fa-map-marker-alt me-1"></i>
                    <strong>Dirección de envío:</strong> ${order.direccion_envio}
                  </small>
                </div>
              `
                : ""
            }
            ${
              order.notas
                ? `
                <div class="order-item">
                  <small class="text-muted">
                    <i class="fas fa-sticky-note me-1"></i>
                    <strong>Notas:</strong> ${order.notas}
                  </small>
                </div>
              `
                : ""
            }
          </div>
        </div>
      `
    )
    .join("");
}

// Modales
function showLoginModal() {
  const registerModal = bootstrap.Modal.getInstance(document.getElementById("registerModal"));
  if (registerModal) registerModal.hide();

  bootstrap.Modal.getOrCreateInstance(document.getElementById("loginModal")).show();
}

function showRegisterModal() {
  const loginModal = bootstrap.Modal.getInstance(document.getElementById("loginModal"));
  if (loginModal) loginModal.hide();

  bootstrap.Modal.getOrCreateInstance(document.getElementById("registerModal")).show();
}

// Utilidades
function formatPrice(price) {
  return new Intl.NumberFormat("es-CO").format(price);
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString("es-CO", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function showLoading(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.style.display = "block";
  }
}

function hideLoading(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.style.display = "none";
  }
}

function showAlert(message, type = "info") {
  // Crear y mostrar una alerta Bootstrap
  const alertDiv = document.createElement("div");
  alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
  alertDiv.style.cssText = "top: 20px; right: 20px; z-index: 9999; max-width: 300px;";
  alertDiv.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `;

  document.body.appendChild(alertDiv);

  // Auto-eliminar después de 5 segundos
  setTimeout(() => {
    if (alertDiv.parentNode) {
      alertDiv.parentNode.removeChild(alertDiv);
    }
  }, 5000);
}

// Inicializar tooltips de Bootstrap
document.addEventListener("DOMContentLoaded", function () {
  var tooltipTriggerList = [].slice.call(
    document.querySelectorAll('[data-bs-toggle="tooltip"]')
  );
  var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl);
  });
});