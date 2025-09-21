================================
Pharmacy Management System - Backend
================================

This repository contains the backend server for a comprehensive Pharmacy Management System, built with Node.js, Express, and MySQL. It provides a robust set of APIs to handle point-of-sale operations, inventory control, user management, reporting, and various internal pharmacy workflows.

## Key Features

* **Point of Sale (POS):**
    * Advanced medicine search (by name, barcode, active ingredient).
    * Batch-aware inventory selection (FIFO/FEFO logic).
    * Bill creation and saving with multiple payment methods.
    * Management of frequent/recurring bills.
    * Bill return and reprint functionality.

* **Inventory & Stock Management:**
    * Full CRUD (Create, Read, Update, Delete) for medicines.
    * Multi-batch management for each medicine.
    * Stock variation tracking (system vs. physical count).
    * Inter-branch stock transfers and receipts (STN/SRN).
    * Purchase Order (PO) and Goods Receipt Note (GRN) management.
    * Agency/Supplier management.

* **Reporting & Analytics:**
    * Detailed sales reports with filtering by date and payment method.
    * Item-wise sales report with extensive search criteria.
    * Near-expiry and low-stock reports.
    * Export functionality to Excel (.xlsx) and PDF for most reports and transactions.

* **User & Administration:**
    * Secure user authentication (login/logout) with password hashing.
    * Session management.
    * Role-based access control (Admin vs. Staff).
    * Full user profile management with photo uploads.

* **Internal & Patient Services:**
    * Internal request center (expenses, maintenance, etc.) with a multi-level approval workflow.
    * Task management system with daily, weekly, and monthly checklists.
    * Patient health testing and data logging.
    * Management of pending customer requests for out-of-stock items.
    * Cross-selling information tool.

## Technology Stack

* **Backend:** Node.js, Express.js
* **Database:** MySQL
* **Key Libraries:** mysql2, bcrypt, express-session, multer, exceljs, pdfkit, pdfmake, moment, cors.

## Setup and Installation

1.  **Prerequisites:**
    * Node.js (v14 or higher)
    * NPM (Node Package Manager)
    * A running MySQL server instance.

2.  **Clone the Repository:**
    ```bash
    git clone <repository-url>
    cd <repository-folder>
    ```

3.  **Install Dependencies:**
    ```bash
    npm install
    ```

4.  **Database Setup:**
    * This application connects to multiple MySQL databases. You must manually create them on your MySQL server. The database names are specified in `server.js`:
        * `medicines`, `bills`, `userauthdb`, `health_db`, `medicine_requirements_db`, `pharmacy_requests_db`, `cross_selling_db`, `PDC`, `tasks`, `customer-requests-db`, `stock_transactions`, `purchase_goods`.
    * You will also need to create the table schemas for each database. An SQL schema file should be used to set up the required tables.


5.  **Run the Server:**
    ```bash
    node server.js
    ```
    The server will start on `http://localhost:3000`.

## Reuse and Repurposing

This project can be freely reused or repurposed for other applications. As a courtesy, please send an email or a direct message to let me know how you're using it.