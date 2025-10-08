const CuotaMensual = require("../models/CuotaMensual");
const Proyecto = require("../models/proyecto");
const { sequelize } = require("../config/database");

const cuotaMensualService = {
	// Función privada para calcular todos los valores y redondearlos.
	_calculateValues(data) {
		const porcentaje_plan = parseFloat(data.porcentaje_plan);
		const porcentaje_administrativo = parseFloat(data.porcentaje_administrativo);
		const porcentaje_iva = parseFloat(data.porcentaje_iva);

		// 1. Calcular el valor_movil directamente
		const valor_movil = data.valor_cemento_unidades * data.valor_cemento;

		// 2. Realizar los cálculos usando el valor_movil
		const total_del_plan = valor_movil * (porcentaje_plan / 100);
		// El valor data.total_cuotas_proyecto ahora contiene el plazo_inversion del proyecto
		const valor_mensual = total_del_plan / data.total_cuotas_proyecto; 
		const carga_administrativa = valor_movil * (porcentaje_administrativo / 100);
		const iva_carga_administrativa = carga_administrativa * (porcentaje_iva / 100);
		const valor_mensual_final = valor_mensual + carga_administrativa + iva_carga_administrativa;

		// Retorna un objeto con todos los valores calculados y redondeados a 2 decimales.
		return {
			valor_movil: parseFloat(valor_movil.toFixed(2)),
			total_del_plan: parseFloat(total_del_plan.toFixed(2)),
			valor_mensual: parseFloat(valor_mensual.toFixed(2)),
			carga_administrativa: parseFloat(carga_administrativa.toFixed(2)),
			iva_carga_administrativa: parseFloat(iva_carga_administrativa.toFixed(2)),
			valor_mensual_final: parseFloat(valor_mensual_final.toFixed(2)),
		};
	},

	/**
	 * Calcula y crea una nueva cuota mensual, y actualiza el monto_inversion del proyecto.
	 * @param {object} data - Datos para crear la cuota.
	 * @returns {Promise<CuotaMensual>} La nueva cuota creada.
	 */
	async createAndSetProjectAmount(data) {
		const t = await sequelize.transaction();
		try {
			// 1. Obtener el Proyecto para extraer el plazo de inversión (que es el número total de cuotas).
			const proyecto = await Proyecto.findByPk(data.id_proyecto, { transaction: t });

			if (!proyecto) {
				await t.rollback();
				throw new Error("El proyecto especificado no fue encontrado.");
			}
            
            // 2. CORRECCIÓN: Usamos el campo 'plazo_inversion' del proyecto.
            const totalCuotasProyecto = proyecto.plazo_inversion;

            if (!totalCuotasProyecto) {
                await t.rollback();
				throw new Error("El proyecto no tiene definido el número total de cuotas ('plazo_inversion'). Por favor, complete ese campo en el modelo Proyecto.");
            }

            // 3. Extender los datos de entrada con el total de cuotas obtenido del proyecto, usando el nombre de campo que espera el modelo CuotaMensual.
			const completeData = {
                ...data,
                // total_cuotas_proyecto es el campo que necesita _calculateValues
                total_cuotas_proyecto: totalCuotasProyecto,
            };

			// Usar la función de ayuda para calcular los valores
			const calculatedValues = this._calculateValues(completeData);

			// Crea la nueva cuota con los campos calculados
			const nuevaCuota = await CuotaMensual.create(
				{
					id_proyecto: completeData.id_proyecto,
					nombre_proyecto: completeData.nombre_proyecto,
					nombre_cemento: completeData.nombre_cemento_cemento,
					valor_cemento_unidades: completeData.valor_cemento_unidades,
					valor_cemento: completeData.valor_cemento,
					// Se guarda el plazo_inversion en el campo total_cuotas_proyecto del modelo CuotaMensual
					total_cuotas_proyecto: completeData.total_cuotas_proyecto, 
					porcentaje_plan: completeData.porcentaje_plan,
					porcentaje_administrativo: completeData.porcentaje_administrativo,
					porcentaje_iva: completeData.porcentaje_iva,
					...calculatedValues, // Utiliza el spread operator para incluir los valores calculados
				},
				{ transaction: t }
			);

			// Actualiza el monto de inversión del proyecto con el valor final
			await Proyecto.update(
				{ monto_inversion: calculatedValues.valor_mensual_final },
				{ where: { id: data.id_proyecto }, transaction: t }
			);

			await t.commit();
			return nuevaCuota;
		} catch (primaryError) {
			// Manejo defensivo: Intenta el rollback. Si falla (porque la transacción ya terminó), ignoramos ese error y relanzamos el error original.
			try {
				if (t.finished !== 'rollback') {
					await t.rollback();
				}
			} catch (rollbackError) {
				// Ignorar el error de rollback si la transacción ya ha terminado.
				// console.error("Error secundario durante el rollback, ignorado.", rollbackError);
			}
			// Re-lanza el error original para que el controlador pueda manejarlo.
			throw primaryError;
		}
	},

	/**
	 * Actualiza una cuota por su ID, recalcula sus valores y actualiza el proyecto.
	 * @param {number} id - ID de la cuota a actualizar.
	 * @param {object} data - Datos a actualizar.
	 * @returns {Promise<CuotaMensual|null>} La cuota actualizada o null si no se encuentra.
	 */
	async update(id, data) {
		const t = await sequelize.transaction();
		try {
			const cuota = await CuotaMensual.findByPk(id, { transaction: t });
			if (!cuota) {
				await t.rollback();
				return null;
			}
            
            // Si el total de cuotas no viene en 'data', lo buscamos en el Proyecto asociado
            if (!data.total_cuotas_proyecto) {
                const proyecto = await Proyecto.findByPk(cuota.id_proyecto, { transaction: t });
                if (proyecto && proyecto.plazo_inversion) {
                    data.total_cuotas_proyecto = proyecto.plazo_inversion;
                } else {
                    // Si no se encuentra ni en el request ni en el proyecto, usamos el valor guardado originalmente en la cuota
                    data.total_cuotas_proyecto = cuota.total_cuotas_proyecto; 
                }
            }


			// Combina los datos de la cuota existente con los nuevos datos de la solicitud.
			const mergedData = { ...cuota.dataValues, ...data };

			// Usar la función de ayuda para calcular los nuevos valores
			const calculatedValues = this._calculateValues(mergedData);

			// Actualiza la cuota con los nuevos valores.
			await cuota.update(
				{
					...mergedData,
					...calculatedValues,
				},
				{ transaction: t }
			);

			// Actualiza el monto de inversión del proyecto asociado
			await Proyecto.update(
				{ monto_inversion: calculatedValues.valor_mensual_final },
				{ where: { id: cuota.id_proyecto }, transaction: t }
			);

			await t.commit();
			return cuota;
		} catch (primaryError) {
			// Manejo defensivo: Intenta el rollback. Si falla, ignoramos el error de rollback y relanzamos el error original.
			try {
				if (t.finished !== 'rollback') {
					await t.rollback();
				}
			} catch (rollbackError) {
				// Ignorar el error de rollback si la transacción ya ha terminado.
				// console.error("Error secundario durante el rollback, ignorado.", rollbackError);
			}
			throw primaryError;
		}
	},

	/**
	 * Obtiene todas las cuotas de un proyecto específico.
	 * @param {number} id_proyecto - ID del proyecto.
	 * @returns {Promise<CuotaMensual[]>} Arreglo de cuotas.
	 */
	async findByProjectId(id_proyecto) {
		return CuotaMensual.findAll({
			where: { id_proyecto: id_proyecto },
			order: [["createdAt", "DESC"]],
		});
	},

	/**
	 * Obtiene la última cuota creada para un proyecto.
	 * @param {number} id_proyecto - ID del proyecto.
	 * @returns {Promise<CuotaMensual>} La última cuota.
	 */
	async findLastByProjectId(id_proyecto) {
		return CuotaMensual.findOne({
			where: { id_proyecto: id_proyecto },
			order: [["createdAt", "DESC"]],
		});
	},

	/**
	 * Elimina lógicamente una cuota (cambia el estado `activo` a false).
	 * @param {number} id - ID de la cuota a "eliminar".
	 */
	async softDelete(id) {
		const cuota = await CuotaMensual.findByPk(id);
		if (!cuota) {
			return null;
		}
		await cuota.update({ activo: false });
		return cuota;
	},
};

module.exports = cuotaMensualService;
