# main.py
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from typing import List, Optional
import mysql.connector
from mysql.connector import Error
import jwt
from datetime import datetime, timedelta
import os
from decimal import Decimal
import json

app = FastAPI(title="ShoesStore API", version="1.0.0")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


SECRET_KEY = "eyJhbGciOiJIUzI1NiJ9.eyJSb2xlIjoiQWRtaW4iLCJJc3N1ZXIiOiJJc3N1ZXIiLCJVc2VybmFtZSI6IkphdmFJblVzZSIsImV4cCI6MTY5ODk4NDEwNiwiaWF0IjoxNjk4OTg0MTA2fQ.W3U9ivlk6ZW1qteEuUvGOjUDp8ed20sBNPKDi4rXWE4"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30


DB_CONFIG = {
    'host': 'localhost',
    'database': 'ecommerce',
    'user': 'root',
    'password': ''
}

security = HTTPBearer()


class UserCreate(BaseModel):
    nombre: str
    email: EmailStr
    telefono: str
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    nombre: str
    email: str
    telefono: str


class ProductResponse(BaseModel):
    id: int
    nombre: str
    descripcion: str
    precio: float
    categoria: str
    imagen_url: str


class CartItem(BaseModel):
    producto_id: int
    cantidad: int


class OrderCreate(BaseModel):
    total: float
    metodo_pago: str
    direccion_envio: str
    notas: Optional[str] = None
    productos: List[dict]


class OrderResponse(BaseModel):
    id: int
    usuario_id: int
    total: float
    metodo_pago: str
    direccion_envio: str
    notas: Optional[str]
    fecha_pedido: datetime
    productos: List[dict]


def get_db_connection():
    """Obtiene conexión a la base de datos"""
    try:
        connection = mysql.connector.connect(**DB_CONFIG)
        return connection
    except Error as e:
        raise HTTPException(
            status_code=500, detail=f"Error de conexión a la base de datos: {str(e)}")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Crea token JWT"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verifica y decodifica el token JWT"""
    try:
        payload = jwt.decode(credentials.credentials,
                             SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token inválido",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return user_id
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user(user_id: int = Depends(verify_token)):
    """Obtiene el usuario actual desde la base de datos"""
    connection = get_db_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT id, nombre, email, telefono FROM usuarios WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        if user is None:
            raise HTTPException(
                status_code=404, detail="Usuario no encontrado")
        return user
    finally:
        connection.close()


@app.post("/api/auth/register", response_model=dict)
async def register(user_data: UserCreate):
    """Registra un nuevo usuario"""
    connection = get_db_connection()
    try:
        cursor = connection.cursor()

        cursor.execute(
            "SELECT id FROM usuarios WHERE email = %s", (user_data.email,))
        if cursor.fetchone():
            raise HTTPException(
                status_code=400, detail="El email ya está registrado")

        insert_query = """
        INSERT INTO usuarios (nombre, email, telefono, password, rol)
        VALUES (%s, %s, %s, %s, %s)
        """
        cursor.execute(insert_query, (
            user_data.nombre,
            user_data.email,
            user_data.telefono,
            user_data.password,
            'cliente'
        ))
        connection.commit()

        return {"message": "Usuario registrado exitosamente"}

    except Error as e:
        connection.rollback()
        raise HTTPException(
            status_code=500, detail=f"Error al registrar usuario: {str(e)}")
    finally:
        connection.close()


@app.post("/api/auth/login")
async def login(user_credentials: UserLogin):
    """Inicia sesión de usuario"""
    connection = get_db_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT id, nombre, email, telefono, password FROM usuarios WHERE email = %s",
            (user_credentials.email,)
        )
        user = cursor.fetchone()

        if not user or user['password'] != user_credentials.password:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Credenciales incorrectas"
            )

        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": str(user['id'])}, expires_delta=access_token_expires
        )

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": user['id'],
                "nombre": user['nombre'],
                "email": user['email'],
                "telefono": user['telefono']
            }
        }

    finally:
        connection.close()


@app.get("/api/productos", response_model=List[ProductResponse])
async def get_productos():
    """Obtiene todos los productos"""
    connection = get_db_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT * FROM productos ORDER BY id")
        productos = cursor.fetchall()

        for producto in productos:
            producto['precio'] = float(producto['precio'])

        return productos

    finally:
        connection.close()


@app.get("/api/productos/{producto_id}", response_model=ProductResponse)
async def get_producto(producto_id: int):
    """Obtiene un producto específico"""
    connection = get_db_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT * FROM productos WHERE id = %s", (producto_id,))
        producto = cursor.fetchone()

        if not producto:
            raise HTTPException(
                status_code=404, detail="Producto no encontrado")

        producto['precio'] = float(producto['precio'])
        return producto

    finally:
        connection.close()


@app.get("/api/productos/categoria/{categoria}")
async def get_productos_por_categoria(categoria: str):
    """Obtiene productos por categoría"""
    connection = get_db_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT * FROM productos WHERE categoria = %s ORDER BY id", (categoria,))
        productos = cursor.fetchall()

        for producto in productos:
            producto['precio'] = float(producto['precio'])

        return productos

    finally:
        connection.close()


@app.get("/api/categorias")
async def get_categorias():
    """Obtiene todas las categorías únicas"""
    connection = get_db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(
            "SELECT DISTINCT categoria FROM productos ORDER BY categoria")
        categorias = [row[0] for row in cursor.fetchall()]
        return categorias

    finally:
        connection.close()


@app.post("/api/pedidos", response_model=dict)
async def crear_pedido(order_data: OrderCreate, current_user: dict = Depends(get_current_user)):
    """Crea un nuevo pedido"""
    connection = get_db_connection()
    try:
        cursor = connection.cursor()

        insert_pedido_query = """
        INSERT INTO pedidos (usuario_id, total, metodo_pago, direccion_envio, notas, fecha_pedido)
        VALUES (%s, %s, %s, %s, %s, %s)
        """
        cursor.execute(insert_pedido_query, (
            current_user['id'],
            order_data.total,
            order_data.metodo_pago,
            order_data.direccion_envio,
            order_data.notas,
            datetime.now()
        ))

        pedido_id = cursor.lastrowid

        for producto in order_data.productos:
            insert_detalle_query = """
            INSERT INTO detalle_pedidos (pedido_id, producto_id, cantidad, precio_unitario)
            VALUES (%s, %s, %s, %s)
            """
            cursor.execute(insert_detalle_query, (
                pedido_id,
                producto['producto_id'],
                producto['cantidad'],
                producto['precio_unitario']
            ))

        connection.commit()

        return {
            "message": "Pedido creado exitosamente",
            "pedido_id": pedido_id
        }

    except Error as e:
        connection.rollback()
        raise HTTPException(
            status_code=500, detail=f"Error al crear pedido: {str(e)}")
    finally:
        connection.close()


@app.get("/api/pedidos/usuario/{usuario_id}")
async def get_pedidos_usuario(usuario_id: int, current_user: dict = Depends(get_current_user)):
    """Obtiene pedidos de un usuario específico"""

    if current_user['id'] != usuario_id:
        raise HTTPException(
            status_code=403, detail="No autorizado para ver estos pedidos")

    connection = get_db_connection()
    try:
        cursor = connection.cursor(dictionary=True)

        pedidos_query = """
        SELECT p.*, u.nombre as usuario_nombre
        FROM pedidos p
        JOIN usuarios u ON p.usuario_id = u.id
        WHERE p.usuario_id = %s
        ORDER BY p.fecha_pedido DESC
        """
        cursor.execute(pedidos_query, (usuario_id,))
        pedidos = cursor.fetchall()

        for pedido in pedidos:
            pedido['total'] = float(pedido['total'])

            detalles_query = """
            SELECT dp.*, pr.nombre, pr.imagen_url
            FROM detalle_pedidos dp
            JOIN productos pr ON dp.producto_id = pr.id
            WHERE dp.pedido_id = %s
            """
            cursor.execute(detalles_query, (pedido['id'],))
            detalles = cursor.fetchall()

            for detalle in detalles:
                detalle['precio_unitario'] = float(detalle['precio_unitario'])

            pedido['productos'] = detalles

        return pedidos

    finally:
        connection.close()


@app.get("/api/pedidos/{pedido_id}")
async def get_pedido(pedido_id: int, current_user: dict = Depends(get_current_user)):
    """Obtiene un pedido específico"""
    connection = get_db_connection()
    try:
        cursor = connection.cursor(dictionary=True)

        cursor.execute("SELECT * FROM pedidos WHERE id = %s", (pedido_id,))
        pedido = cursor.fetchone()

        if not pedido:
            raise HTTPException(status_code=404, detail="Pedido no encontrado")

        if pedido['usuario_id'] != current_user['id']:
            raise HTTPException(
                status_code=403, detail="No autorizado para ver este pedido")

        pedido['total'] = float(pedido['total'])

        detalles_query = """
        SELECT dp.*, pr.nombre, pr.imagen_url
        FROM detalle_pedidos dp
        JOIN productos pr ON dp.producto_id = pr.id
        WHERE dp.pedido_id = %s
        """
        cursor.execute(detalles_query, (pedido_id,))
        detalles = cursor.fetchall()

        for detalle in detalles:
            detalle['precio_unitario'] = float(detalle['precio_unitario'])

        pedido['productos'] = detalles

        return pedido

    finally:
        connection.close()


@app.get("/api/productos/buscar/{termino}")
async def buscar_productos(termino: str):
    """Busca productos por nombre, descripción o categoría"""
    connection = get_db_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        search_query = """
        SELECT * FROM productos 
        WHERE nombre LIKE %s OR descripcion LIKE %s OR categoria LIKE %s
        ORDER BY nombre
        """
        search_term = f"%{termino}%"
        cursor.execute(search_query, (search_term, search_term, search_term))
        productos = cursor.fetchall()

        for producto in productos:
            producto['precio'] = float(producto['precio'])

        return productos

    finally:
        connection.close()


@app.get("/api/health")
async def health_check():
    """Verifica el estado de la API"""
    return {"status": "OK", "timestamp": datetime.now()}


@app.get("/api/usuario/perfil", response_model=UserResponse)
async def get_perfil(current_user: dict = Depends(get_current_user)):
    """Obtiene el perfil del usuario actual"""
    return current_user

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
